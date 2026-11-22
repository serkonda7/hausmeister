import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { Match, Show, Switch } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { TypeEditor } from "~/components/item-types/type-editor";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { showToast } from "~/components/ui/toast";
import { guardSection } from "~/lib/admin-sections";
import { itemTypeErrorMessage } from "~/lib/item-types/errors";
import { typeIconGlyph } from "~/lib/item-types/icons";
import { itemTypeQuery, itemTypesQuery } from "~/lib/item-types/queries";
import { m } from "~/paraglide/messages";
import { archiveItemTypeFn, deleteItemTypeFn } from "~/server/item-types/functions";

export const Route = createFileRoute("/_authed/admin/types/$typeId")({
  beforeLoad: ({ context }) => guardSection(context.user.role, "/admin/types"),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(itemTypeQuery(params.typeId)),
      context.queryClient.ensureQueryData(itemTypesQuery()),
    ]),
  head: () => ({ meta: [{ title: `${m.types_title()} · ${m.app_name()}` }] }),
  component: EditTypePage,
});

function EditTypePage() {
  const params = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const type = useQuery(() => itemTypeQuery(params().typeId));
  const types = useQuery(() => itemTypesQuery());
  const refresh = () => qc.invalidateQueries({ queryKey: ["item-types"] });

  async function act(fn: () => Promise<unknown>, success: string, after?: () => void) {
    try {
      await fn();
      showToast({ title: success, variant: "success" });
      after?.();
      await refresh();
    } catch (err) {
      showToast({ title: itemTypeErrorMessage(err), variant: "error" });
    }
  }

  return (
    <Show when={type.data && types.data ? { t: type.data, tree: types.data } : undefined} keyed>
      {({ t, tree }) => (
        <div class="grid gap-4">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-xl font-semibold">
              <span aria-hidden="true">{typeIconGlyph(t.icon)} </span>
              {t.name}
            </h2>
            <Show when={t.archivedAt}>
              <Badge variant="secondary">{m.types_archived_badge()}</Badge>
            </Show>
            <Link
              to="/admin/types"
              class="ml-auto text-sm text-primary underline-offset-4 hover:underline"
            >
              {m.types_back()}
            </Link>
          </div>

          <Switch>
            <Match when={t.editBlock === "guest"}>
              <p class="rounded-md border bg-muted p-3 text-sm">{m.types_readonly_guest()}</p>
            </Match>
            <Match when={t.editBlock === "not_creator"}>
              <p class="rounded-md border bg-muted p-3 text-sm">{m.types_readonly_not_creator()}</p>
            </Match>
            <Match when={t.editBlock === "in_use_by_others"}>
              <p class="rounded-md border bg-muted p-3 text-sm">{m.types_readonly_in_use()}</p>
            </Match>
          </Switch>

          <Show when={t.canEdit}>
            <div class="flex flex-wrap gap-2">
              <Link
                class={buttonVariants({ variant: "outline", size: "sm" })}
                to="/admin/types/new"
                search={{ parent: t.id }}
              >
                + {m.types_new()}
              </Link>
              <ConfirmButton
                label={t.archivedAt ? m.types_unarchive() : m.types_archive()}
                question={m.types_archive_hint()}
                onConfirm={() =>
                  act(
                    () => archiveItemTypeFn({ data: { id: t.id, archived: !t.archivedAt } }),
                    t.archivedAt ? m.types_unarchived() : m.types_archived(),
                  )
                }
              />
              <ConfirmButton
                label={m.types_delete()}
                question={m.types_delete_body()}
                destructive
                variant="destructive"
                onConfirm={() =>
                  act(
                    () => deleteItemTypeFn({ data: { id: t.id } }),
                    m.types_deleted(),
                    () => navigate({ to: "/admin/types" }),
                  )
                }
              />
            </div>
          </Show>

          <TypeEditor
            mode="edit"
            typeId={t.id}
            tree={tree}
            readOnly={!t.canEdit}
            initial={{
              key: t.key,
              name: t.name,
              icon: t.icon,
              tracking: t.tracking,
              parentId: t.parentId,
              fields: t.fields,
            }}
            onSaved={() => {}}
          />
        </div>
      )}
    </Show>
  );
}
