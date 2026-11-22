// Item detail: photos, fields, place, owner, visibility, tags, contents,
// relations, files, history, sharing, and the actions the caller's level allows.
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { createMemo, For, type JSX, Show } from "solid-js";
import { AttachmentFileList } from "~/components/attachments/file-list";
import { PhotoGallery } from "~/components/attachments/gallery";
import { attachmentsQuery } from "~/components/attachments/queries";
import { AttachmentUploader } from "~/components/attachments/uploader";
import { AttributeList } from "~/components/item-types/attribute-list";
import { ItemBreadcrumbs } from "~/components/items/breadcrumbs";
import {
  DeleteAction,
  MoveAction,
  OwnerAction,
  StatusAction,
  TypeAction,
  VisibilityAction,
} from "~/components/items/item-actions";
import { ItemResults } from "~/components/items/item-card";
import { ItemHistory } from "~/components/items/item-history";
import { ItemRelationsSection } from "~/components/items/item-relations";
import { ItemSharing } from "~/components/items/item-sharing";
import { isMissing, NotFoundCard } from "~/components/items/not-found";
import { StockControl } from "~/components/items/stock-control";
import { ItemLoansSection } from "~/components/loans/item-loans";
import { TransferAction, TransferBanner } from "~/components/transfers/transfer";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { formatCents, formatDate, formatNumber } from "~/lib/format";
import { typeIconGlyph } from "~/lib/item-types/icons";
import { statusLabel } from "~/lib/items/labels";
import { itemQuery } from "~/lib/items/queries";
import type { ItemDetail } from "~/lib/items/types";
import { itemLoansQuery } from "~/lib/loans/queries";
import { itemRelationsQuery } from "~/lib/relations/queries";
import { itemTransferQuery } from "~/lib/transfers/queries";
import { m } from "~/paraglide/messages";

export const Route = createFileRoute("/_authed/items/$itemId/")({
  loader: async ({ context, params }) => {
    if (params.itemId.length > 64) throw notFound();
    try {
      const d = await context.queryClient.ensureQueryData(itemQuery(params.itemId));
      await Promise.all([
        context.queryClient.ensureQueryData(attachmentsQuery(params.itemId)),
        context.queryClient.ensureQueryData(itemLoansQuery(params.itemId)),
        context.queryClient.ensureQueryData(itemTransferQuery(params.itemId)),
        context.queryClient.ensureQueryData(itemRelationsQuery(params.itemId)),
      ]);
      return { name: d.item.name };
    } catch (err) {
      if (isMissing(err, ["ITEM_NOT_FOUND", "NOT_FOUND"])) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? m.item_not_found_title()} · ${m.app_name()}` }],
  }),
  notFoundComponent: () => <NotFoundCard kind="item" />,
  component: ItemPage,
});

function Fact(props: { label: string; children: JSX.Element; testId?: string }) {
  return (
    <>
      <dt class="text-sm text-muted-foreground">{props.label}</dt>
      <dd class="min-w-0 break-words" data-testid={props.testId}>
        {props.children}
      </dd>
    </>
  );
}

function Section(props: {
  title: string;
  id: string;
  children: JSX.Element;
  actions?: JSX.Element;
}) {
  return (
    <section class="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby={props.id}>
      <div class="flex flex-wrap items-center gap-2">
        <h2 id={props.id} class="mr-auto text-lg font-semibold">
          {props.title}
        </h2>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

function ItemPage() {
  const params = Route.useParams();
  const q = useQuery(() => itemQuery(params().itemId));
  return (
    <Show
      when={q.data}
      fallback={
        <Show when={q.isError}>
          <NotFoundCard kind="item" />
        </Show>
      }
    >
      {(d) => <ItemView detail={d()} />}
    </Show>
  );
}

function ItemView(props: { detail: ItemDetail }) {
  const ctx = Route.useRouteContext();
  const d = () => props.detail;
  const it = () => d().item;
  const perms = () => d().permissions;
  const price = () =>
    "priceCents" in it() && it().priceCents != null
      ? formatCents(
          it().priceCents as number,
          (it() as { currency?: string | null }).currency ?? "EUR",
        )
      : null;
  const hasFiles = createMemo(() => d().attachments.some((a) => a.kind !== "photo"));
  const isStock = () => d().type.tracking === "stock";

  return (
    <article class="grid gap-4" aria-labelledby="item-title">
      <header class="grid gap-2">
        <Show when={d().path.length}>
          <div class="text-sm">
            <ItemBreadcrumbs path={d().path} />
          </div>
        </Show>
        <div class="flex flex-wrap items-start gap-2">
          <h1 id="item-title" class="min-w-0 flex-1 break-words text-2xl font-semibold">
            {it().name}
          </h1>
          <Show when={perms().canEdit}>
            <Link
              to="/items/$itemId/edit"
              params={{ itemId: it().id }}
              class={buttonVariants({ variant: "default" })}
            >
              {m.item_action_edit()}
            </Link>
          </Show>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">
            <span aria-hidden="true">{typeIconGlyph(d().type.icon)}&nbsp;</span>
            {d().type.name}
          </Badge>
          <Badge variant={it().status === "available" ? "outline" : "default"}>
            {statusLabel(it().status)}
          </Badge>
          <Show when={it().visibility === "private"}>
            <Badge variant="outline">{m.item_visibility_private_short()}</Badge>
          </Show>
          <Show when={it().shortCode}>
            <span class="font-mono text-muted-foreground" data-testid="short-code">
              <span class="sr-only">{m.item_short_code()}: </span>
              {it().shortCode}
            </span>
            <Link
              to="/labels"
              search={{ item: [it().id] }}
              class="text-primary underline-offset-4 hover:underline"
            >
              {m.labels_print_one()}
            </Link>
          </Show>
        </div>
      </header>

      <Show when={perms().canUse}>
        {/* biome-ignore lint/a11y/useSemanticElements: a button group, not a form fieldset */}
        <div class="flex flex-wrap gap-2" role="group" aria-label={m.item_actions()}>
          <MoveAction detail={d()} />
          <StatusAction detail={d()} />
          <Show when={perms().canEdit}>
            <TypeAction detail={d()} />
          </Show>
          <Show when={perms().canChangeOwner}>
            <OwnerAction detail={d()} user={ctx().user} />
          </Show>
          <Show when={perms().canTransfer}>
            <TransferAction detail={d()} user={ctx().user} />
          </Show>
          <Show when={perms().canManage}>
            <VisibilityAction detail={d()} />
            <DeleteAction detail={d()} />
          </Show>
        </div>
      </Show>

      <TransferBanner itemId={it().id} itemName={it().name} />

      <ItemLoansSection detail={d()} user={ctx().user} />

      <Show when={isStock() || it().minQuantity != null}>
        <Section title={m.stock_title()} id="item-stock">
          <StockControl item={it()} canUse={perms().canUse} />
        </Section>
      </Show>

      <Section title={m.attachments_photos()} id="item-photos">
        <PhotoGallery itemId={it().id} level={it().level} />
        <AttachmentUploader itemId={it().id} level={it().level} kinds={["photo"]} />
      </Section>

      <Section title={m.item_details()} id="item-details">
        <dl class="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
          <Fact label={m.item_field_owner()} testId="item-owner">
            {d().owner.name}
          </Fact>
          <Fact label={m.item_field_visibility()} testId="item-visibility">
            {it().visibility === "private"
              ? m.items_visibility_private()
              : m.items_visibility_household()}
          </Fact>
          <Fact label={m.item_field_location()}>
            <ItemBreadcrumbs path={d().path} label={m.item_place_of({ name: it().name })} />
          </Fact>
          <Show when={!isStock() && it().minQuantity == null && (it().quantity !== 1 || it().unit)}>
            <Fact label={m.item_field_quantity()}>
              {formatNumber(it().quantity, 3)} {it().unit ?? ""}
              <Show when={it().minQuantity != null}>
                <span class="text-sm text-muted-foreground">
                  {" "}
                  ({m.item_min_quantity_short({ n: formatNumber(it().minQuantity ?? 0, 3) })})
                </span>
              </Show>
            </Fact>
          </Show>
          <Show when={it().condition}>
            <Fact label={m.item_field_condition()}>{it().condition}</Fact>
          </Show>
          <Show when={it().acquiredOn}>
            {(a) => (
              <Fact label={m.item_field_acquired_on()}>{formatDate(`${a()}T12:00:00Z`)}</Fact>
            )}
          </Show>
          <Show when={price()}>
            {(p) => (
              <Fact label={m.item_field_price()} testId="item-price">
                {p()}
              </Fact>
            )}
          </Show>
          <Show when={it().barcode}>
            <Fact label={m.item_field_barcode()}>
              <span class="font-mono">{it().barcode}</span>
            </Fact>
          </Show>
          <Show when={d().tags.length}>
            <Fact label={m.item_field_tags()}>
              <ul class="flex flex-wrap gap-1">
                <For each={d().tags}>
                  {(t) => (
                    <li>
                      <Link
                        to="/items"
                        search={{ tag: [t.id] }}
                        class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm hover:bg-accent"
                      >
                        <Show when={t.color}>
                          <span
                            class="inline-block size-2.5 rounded-full border border-foreground/40"
                            style={{ "background-color": t.color ?? undefined }}
                            aria-hidden="true"
                          />
                        </Show>
                        {t.name}
                      </Link>
                    </li>
                  )}
                </For>
              </ul>
            </Fact>
          </Show>
        </dl>
        <Show when={it().description}>
          <p class="whitespace-pre-line break-words">{it().description}</p>
        </Show>
      </Section>

      <Show when={Object.keys(it().attributes).length || Object.keys(d().hiddenReferences).length}>
        <Section title={m.item_type_fields({ type: d().type.name })} id="item-attributes">
          <AttributeList
            fields={d().type.effectiveFields}
            attributes={it().attributes}
            userName={(id) => d().references.users[id]}
            itemName={(id) => d().references.items[id]}
            hiddenReferences={d().hiddenReferences}
          />
        </Section>
      </Show>

      <Show when={d().contentsCount > 0}>
        <Section
          title={m.item_contents({ count: d().contentsCount })}
          id="item-contents"
          actions={
            <Show when={ctx().user.role !== "guest"}>
              <Link
                to="/items/new"
                search={{ container: it().id }}
                class={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {m.item_add_inside()}
              </Link>
            </Show>
          }
        >
          <ItemResults
            input={{ containerId: it().id, sort: "name_asc" }}
            view="list"
            label={m.item_contents_label({ name: it().name })}
            empty={<p class="text-sm text-muted-foreground">{m.item_contents_empty()}</p>}
          />
        </Section>
      </Show>
      <Show when={d().contentsCount === 0 && ctx().user.role !== "guest"}>
        <p class="text-sm">
          <Link
            to="/items/new"
            search={{ container: it().id }}
            class="text-primary underline-offset-4 hover:underline"
          >
            {m.item_add_inside()}
          </Link>
        </p>
      </Show>

      <ItemRelationsSection itemId={it().id} itemName={it().name} />

      <Show when={perms().canEdit || hasFiles()}>
        <Section title={m.item_files()} id="item-files">
          <Show when={perms().canEdit}>
            <div class="grid gap-2">
              <h3 class="font-medium">{m.attachments_receipts()}</h3>
              <p class="text-xs text-muted-foreground">{m.attachments_receipts_hint()}</p>
              <AttachmentFileList itemId={it().id} level={it().level} kind="receipt" />
            </div>
          </Show>
          <Show when={perms().canEdit || d().attachments.some((a) => a.kind === "manual")}>
            <div class="grid gap-2">
              <h3 class="font-medium">{m.attachments_manuals()}</h3>
              <AttachmentFileList itemId={it().id} level={it().level} kind="manual" />
            </div>
          </Show>
          <Show when={d().attachments.some((a) => a.kind === "other")}>
            <div class="grid gap-2">
              <h3 class="font-medium">{m.attachments_others()}</h3>
              <AttachmentFileList itemId={it().id} level={it().level} kind="other" />
            </div>
          </Show>
          <AttachmentUploader
            itemId={it().id}
            level={it().level}
            kinds={["receipt", "manual", "other"]}
          />
        </Section>
      </Show>

      <Show when={d().grants}>
        {(g) => (
          <Section title={m.item_share()} id="item-share">
            <ItemSharing
              itemId={it().id}
              itemName={it().name}
              grants={g()}
              owner={d().owner}
              meId={ctx().user.id}
            />
          </Section>
        )}
      </Show>

      <Section title={m.item_history()} id="item-history">
        <ItemHistory itemId={it().id} fields={d().type.effectiveFields} />
      </Section>
    </article>
  );
}
