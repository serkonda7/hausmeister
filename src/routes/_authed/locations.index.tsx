// Locations: the whole tree (House → Garage → Shelf 2) with visible item
// counts. Guests see only the locations of items shared with them.
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { CreateLocationForm } from "~/components/locations/location-forms";
import { LocationTree } from "~/components/locations/location-tree";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { locationsQuery } from "~/lib/items/queries";
import { m } from "~/paraglide/messages";

export const Route = createFileRoute("/_authed/locations/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(locationsQuery()),
  head: () => ({ meta: [{ title: `${m.nav_locations()} · ${m.app_name()}` }] }),
  component: LocationsPage,
});

function LocationsPage() {
  const ctx = Route.useRouteContext();
  const tree = useQuery(() => locationsQuery());
  const canWrite = () => ctx().user.role !== "guest";
  return (
    <div class="grid gap-4">
      <h1 class="text-2xl font-semibold">{m.nav_locations()}</h1>
      <Show
        when={(tree.data ?? []).length}
        fallback={
          <p class="rounded-lg border border-dashed p-6 text-muted-foreground">
            {canWrite() ? m.locations_empty() : m.locations_empty_guest()}
          </p>
        }
      >
        <Card>
          <CardContent class="pt-4">
            <p class="mb-2 text-sm text-muted-foreground">{m.locations_tree_hint()}</p>
            <LocationTree nodes={tree.data ?? []} label={m.nav_locations()} />
          </CardContent>
        </Card>
      </Show>
      <Show when={canWrite()}>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{m.locations_new_top()}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CreateLocationForm parentId={null} idPrefix="loc-new" />
          </CardContent>
        </Card>
      </Show>
    </div>
  );
}
