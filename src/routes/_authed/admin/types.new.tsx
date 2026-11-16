import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { z } from "zod";
import { TypeEditor } from "~/components/item-types/type-editor";
import { guardSection } from "~/lib/admin-sections";
import { itemTypesQuery } from "~/lib/item-types/queries";
import { m } from "~/paraglide/messages";

export const Route = createFileRoute("/_authed/admin/types/new")({
  validateSearch: z.object({ parent: z.string().optional() }),
  beforeLoad: ({ context }) => {
    guardSection(context.user.role, "/admin/types");
    if (context.user.role === "guest") throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(itemTypesQuery()),
  head: () => ({ meta: [{ title: `${m.types_new_title()} · ${m.app_name()}` }] }),
  component: NewTypePage,
});

function NewTypePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const types = useQuery(() => itemTypesQuery());
  return (
    <div class="grid gap-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">{m.types_new_title()}</h2>
        <Link to="/admin/types" class="text-sm text-primary underline-offset-4 hover:underline">
          {m.types_back()}
        </Link>
      </div>
      <Show when={types.data}>
        {(tree) => (
          <TypeEditor
            mode="create"
            tree={tree()}
            initial={{
              key: "",
              name: "",
              icon: "box",
              tracking: "individual",
              parentId: search().parent ?? null,
              fields: [],
            }}
            onSaved={(id) => navigate({ to: "/admin/types/$typeId", params: { typeId: id } })}
          />
        )}
      </Show>
    </div>
  );
}
