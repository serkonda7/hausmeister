// Edit an item (needs `edit`). Optimistic locking made visible: when someone
// else saved in the meantime, the user keeps their input, sees what the other
// person changed, and can reload (drop their input) or reapply their own
// changes on top of the new version. Leaving with unsaved changes asks first.
import { createForm } from "@tanstack/solid-form";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, Link, notFound, useBlocker, useNavigate } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show, untrack } from "solid-js";
import { createStore, reconcile, unwrap } from "solid-js/store";
import { AttributeFields } from "~/components/item-types/attribute-fields";
import {
  applyAttributeErrors,
  focusFirstError,
  ItemBaseFields,
  NameField,
} from "~/components/items/item-form";
import { isMissing, NotFoundCard } from "~/components/items/not-found";
import { Button, buttonVariants } from "~/components/ui/button";
import { formatAttributeValue } from "~/lib/item-types/display";
import { activeFields } from "~/lib/item-types/fields";
import { parseItemsError } from "~/lib/items/errors";
import {
  BASE_LABEL,
  type BaseErrors,
  baseValuesFromItem,
  changedKeys,
  type ItemBaseValues,
  parseBaseValues,
} from "~/lib/items/form";
import { itemQuery } from "~/lib/items/queries";
import type { ItemDetail } from "~/lib/items/types";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { updateItemFn } from "~/server/items/functions";

export const Route = createFileRoute("/_authed/items/$itemId/edit")({
  loader: async ({ context, params }) => {
    if (params.itemId.length > 64) throw notFound();
    try {
      const d = await context.queryClient.ensureQueryData(itemQuery(params.itemId));
      return { name: d.item.name };
    } catch (err) {
      if (isMissing(err, ["ITEM_NOT_FOUND"])) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${m.item_edit_title({ name: loaderData?.name ?? "" })} · ${m.app_name()}` }],
  }),
  notFoundComponent: () => <NotFoundCard kind="item" />,
  component: EditItemPage,
});

function EditItemPage() {
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
      {(d) => (
        // Not keyed: a refetch (e.g. after a conflict) must not remount the form.
        <Show
          when={d().permissions.canEdit}
          fallback={
            <div class="grid gap-3">
              <p role="alert">{m.items_error_forbidden()}</p>
              <Link
                to="/items/$itemId"
                params={{ itemId: d().item.id }}
                class="text-primary underline"
              >
                {m.item_back_to({ name: d().item.name })}
              </Link>
            </div>
          }
        >
          <EditForm initial={untrack(d)} />
        </Show>
      )}
    </Show>
  );
}

type Snapshot = { version: number; base: ItemBaseValues; attributes: Record<string, unknown> };

const pick = <T extends object>(o: T, keys: readonly (keyof T)[]) =>
  Object.fromEntries(keys.map((k) => [k, o[k]])) as Partial<T>;

function EditForm(props: { initial: ItemDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const id = untrack(() => props.initial.item.id);
  const fields = untrack(() => props.initial.type.effectiveFields);
  const active = activeFields(fields);
  const activeKeys = new Set(active.map((f) => f.key));
  const onlyActive = (a: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(a).filter(([k]) => activeKeys.has(k)));
  const snap = (d: ItemDetail): Snapshot => ({
    version: d.item.version,
    base: baseValuesFromItem(d),
    attributes: onlyActive(d.item.attributes),
  });

  const [snapshot, setSnapshot] = createSignal<Snapshot>(untrack(() => snap(props.initial)));
  const [base, setBase] = createStore<ItemBaseValues>(structuredClone(snapshot().base));
  const [errors, setErrors] = createSignal<BaseErrors>({});
  const [busy, setBusy] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [conflict, setConflict] = createSignal<{
    latest: ItemDetail;
    theirs: ReturnType<typeof changedKeys>;
  } | null>(null);

  const form = createForm(() => ({
    defaultValues: { attributes: structuredClone(snapshot().attributes) },
    onSubmit: ({ value }) => save(value.attributes),
  }));
  const attrValues = form.useStore((s) => s.values.attributes);

  const current = (): Snapshot => ({
    version: snapshot().version,
    base: unwrap(base),
    attributes: onlyActive(attrValues() ?? {}),
  });
  const mine = createMemo(() => {
    void base.name;
    void JSON.stringify(base);
    return changedKeys(snapshot(), current());
  });
  const dirty = () => !saved() && (mine().base.length > 0 || mine().attributes.length > 0);

  useBlocker({
    shouldBlockFn: () => dirty() && !window.confirm(m.item_leave_confirm()),
    enableBeforeUnload: dirty,
  });

  let parsed: ReturnType<typeof parseBaseValues> | null = null;
  async function onSubmit(e?: SubmitEvent) {
    e?.preventDefault();
    if (busy()) return;
    parsed = parseBaseValues(base, { withPrice: true });
    setErrors(parsed.ok ? {} : parsed.errors);
    await form.handleSubmit();
    if (!parsed.ok) focusFirstError("edit", parsed.errors);
  }

  async function save(attrs: Record<string, unknown>) {
    if (!parsed?.ok) return;
    const data = parsed.data;
    setBusy(true);
    const r = await runAction(
      () =>
        updateItemFn({
          data: {
            id,
            version: snapshot().version,
            ...data,
            attributes: onlyActive(attrs),
          } as Parameters<typeof updateItemFn>[0]["data"],
        }),
      {
        success: m.item_saved(),
        onError: (err) => {
          const p = parseItemsError(err);
          if (p.code === "ATTRIBUTES_INVALID") {
            applyAttributeErrors(form, p.fieldErrors, { idPrefix: "edit-attr" });
          }
          if (p.code === "VERSION_CONFLICT") {
            void loadConflict();
            return true;
          }
          return false;
        },
      },
    );
    setBusy(false);
    if (!r) return;
    setSaved(true);
    setConflict(null);
    await qc.invalidateQueries({ queryKey: ["items"] });
    await qc.invalidateQueries({ queryKey: ["tags"] });
    await navigate({ to: "/items/$itemId", params: { itemId: id } });
  }

  async function loadConflict() {
    await qc.invalidateQueries({ queryKey: itemQuery(id).queryKey });
    try {
      const latest = await qc.fetchQuery(itemQuery(id));
      setConflict({ latest, theirs: changedKeys(snapshot(), snap(latest)) });
      queueMicrotask(() => document.getElementById("edit-conflict")?.focus());
    } catch (err) {
      if (parseItemsError(err).code === "ITEM_NOT_FOUND") {
        setSaved(true);
        await navigate({ to: "/items/$itemId", params: { itemId: id } });
      }
    }
  }

  /** Drops the user's input and starts again from the latest version. */
  function reload() {
    const c = conflict();
    if (!c) return;
    const s = snap(c.latest);
    setSnapshot(s);
    setBase(reconcile(structuredClone(s.base)));
    form.reset({ attributes: structuredClone(s.attributes) });
    setConflict(null);
    setErrors({});
  }

  /** The user's own changes on top of the latest version, then save. */
  async function reapply() {
    const c = conflict();
    if (!c) return;
    const mineNow = mine();
    const cur = current();
    const s = snap(c.latest);
    const nextBase = { ...s.base, ...pick(cur.base, mineNow.base) } as ItemBaseValues;
    const nextAttrs = { ...s.attributes };
    for (const k of mineNow.attributes) {
      if (cur.attributes[k] === undefined) delete nextAttrs[k];
      else nextAttrs[k] = cur.attributes[k];
    }
    setSnapshot(s);
    setBase(reconcile(structuredClone(nextBase)));
    form.reset({ attributes: structuredClone(nextAttrs) });
    setConflict(null);
    await onSubmit();
  }

  const theirValue = (key: string, d: ItemDetail) => {
    if (key in BASE_LABEL) {
      const v = baseValuesFromItem(d)[key as keyof ItemBaseValues];
      return Array.isArray(v) ? v.join(", ") || "—" : v || "—";
    }
    const f = fields.find((x) => x.key === key);
    return (f && formatAttributeValue(f, d.item.attributes[key])) || "—";
  };

  return (
    <div class="grid gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="min-w-0 flex-1 break-words text-2xl font-semibold">
          {m.item_edit_title({ name: snapshot().base.name })}
        </h1>
        <Link
          to="/items/$itemId"
          params={{ itemId: id }}
          class="text-sm text-primary underline-offset-4 hover:underline"
        >
          {m.common_cancel()}
        </Link>
      </div>

      <Show when={conflict()}>
        {(c) => (
          <div
            id="edit-conflict"
            role="alert"
            tabIndex={-1}
            class="grid gap-3 rounded-md border-2 border-destructive p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="edit-conflict"
          >
            <p class="font-medium">{m.item_conflict_title()}</p>
            <p class="text-sm">{m.item_conflict_body()}</p>
            <Show when={c().theirs.base.length + c().theirs.attributes.length > 0}>
              <div class="grid gap-1 text-sm">
                <p class="font-medium">{m.item_conflict_their_changes()}</p>
                <ul class="list-disc pl-5">
                  <For each={[...c().theirs.base, ...c().theirs.attributes]}>
                    {(k) => (
                      <li class="break-words">
                        {k in BASE_LABEL
                          ? BASE_LABEL[k as keyof ItemBaseValues]()
                          : (fields.find((f) => f.key === k)?.label ?? k)}
                        : {theirValue(k, c().latest)}
                        <Show
                          when={
                            (mine().base as string[]).includes(k) || mine().attributes.includes(k)
                          }
                        >
                          <span class="text-destructive"> · {m.item_conflict_both()}</span>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
            <div class="flex flex-wrap gap-2">
              <Button onClick={() => void reapply()} disabled={busy()}>
                {m.item_conflict_reapply()}
              </Button>
              <Button variant="outline" onClick={reload} disabled={busy()}>
                {m.item_conflict_reload()}
              </Button>
            </div>
          </div>
        )}
      </Show>

      <form class="grid gap-5" noValidate onSubmit={onSubmit}>
        <NameField
          id="edit-name"
          value={base.name}
          onInput={(v) => setBase("name", v)}
          error={errors().name}
        />
        <ItemBaseFields
          idPrefix="edit"
          values={base}
          set={setBase}
          errors={errors()}
          withPrice
          stock={props.initial.type.tracking === "stock"}
          currency={
            ("currency" in props.initial.item ? props.initial.item.currency : null) ?? undefined
          }
        />
        <Show when={active.length}>
          <section class="grid gap-3" aria-labelledby="edit-attrs-h">
            <h2 id="edit-attrs-h" class="font-medium">
              {m.item_type_fields({ type: props.initial.type.name })}
            </h2>
            <AttributeFields
              form={form}
              fields={fields}
              idPrefix="edit-attr"
              itemName={(i) => props.initial.references.items[i]}
            />
          </section>
        </Show>
        <div class="sticky bottom-20 z-10 -mx-4 flex flex-wrap gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          <Button type="submit" size="lg" disabled={busy() || !!conflict()}>
            {busy() ? m.item_saving() : m.common_save()}
          </Button>
          <Link
            to="/items/$itemId"
            params={{ itemId: id }}
            class={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {m.common_cancel()}
          </Link>
          <Show when={dirty()}>
            <span class="self-center text-sm text-muted-foreground" role="status">
              {m.item_unsaved()}
            </span>
          </Show>
        </div>
      </form>
    </div>
  );
}
