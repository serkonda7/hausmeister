// One location: breadcrumbs, kind, short code, notes, sub-locations, the
// items placed directly here (same list components and search function as
// /items), and create / edit / move / delete for those who may.
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { ItemResults } from "~/components/items/item-card";
import { isMissing, NotFoundCard } from "~/components/items/not-found";
import {
  CreateLocationForm,
  DeleteLocationButton,
  EditLocationDialog,
  MoveLocationDialog,
} from "~/components/locations/location-forms";
import { LocationTree } from "~/components/locations/location-tree";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { formatNumber } from "~/lib/format";
import type { SearchItemsInput } from "~/lib/items/inputs";
import { locationKindLabel } from "~/lib/items/labels";
import { itemListQuery, locationQuery } from "~/lib/items/queries";
import type { LocationDetail } from "~/lib/items/types";
import { m } from "~/paraglide/messages";

const contentsInput = (locationId: string): SearchItemsInput => ({
  locationId,
  locationScope: "direct",
  sort: "name_asc",
});

export const Route = createFileRoute("/_authed/locations/$locationId")({
  loader: async ({ context, params }) => {
    if (params.locationId.length > 64) throw notFound();
    // The contents list renders with the page; fetch it alongside the location.
    void context.queryClient.prefetchInfiniteQuery(itemListQuery(contentsInput(params.locationId)));
    try {
      const d = await context.queryClient.ensureQueryData(locationQuery(params.locationId));
      return { name: d.name };
    } catch (err) {
      if (isMissing(err, ["LOCATION_NOT_FOUND"])) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? m.nav_locations()} · ${m.app_name()}` }],
  }),
  notFoundComponent: () => <NotFoundCard kind="location" />,
  component: LocationPage,
});

function LocationPage() {
  const params = Route.useParams();
  const q = useQuery(() => locationQuery(params().locationId));
  return (
    <Show
      when={q.data}
      fallback={
        <Show when={q.isError}>
          <NotFoundCard kind="location" />
        </Show>
      }
    >
      {(d) => <LocationView loc={d()} />}
    </Show>
  );
}

function LocationView(props: { loc: LocationDetail }) {
  const ctx = Route.useRouteContext();
  const l = () => props.loc;
  return (
    <div class="grid gap-4">
      <nav aria-label={m.item_breadcrumbs()} class="text-sm">
        <ol class="flex flex-wrap items-center gap-1">
          <li>
            <Link to="/locations" class="text-primary underline-offset-4 hover:underline">
              {m.nav_locations()}
            </Link>
          </li>
          <For each={l().path}>
            {(p) => (
              <li class="flex items-center gap-1">
                <span aria-hidden="true" class="text-muted-foreground">
                  ›
                </span>
                <Link
                  to="/locations/$locationId"
                  params={{ locationId: p.id }}
                  class="break-words text-primary underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>
              </li>
            )}
          </For>
          <li class="flex items-center gap-1" aria-current="page">
            <span aria-hidden="true" class="text-muted-foreground">
              ›
            </span>
            <span class="break-words">{l().name}</span>
          </li>
        </ol>
      </nav>

      <header class="grid gap-2">
        <h1 class="break-words text-2xl font-semibold">{l().name}</h1>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <Show when={l().kind}>
            {(k) => <Badge variant="secondary">{locationKindLabel(k())}</Badge>}
          </Show>
          <Show when={l().shortCode}>
            <span class="font-mono text-muted-foreground" data-testid="location-short-code">
              <span class="sr-only">{m.item_short_code()}: </span>
              {l().shortCode}
            </span>
            <Link
              to="/labels"
              search={{
                location: [
                  l().id,
                  ...l()
                    .children.filter((c) => c.shortCode)
                    .map((c) => c.id),
                ],
              }}
              class="text-primary underline-offset-4 hover:underline"
            >
              {l().children.length ? m.labels_print_location_tree() : m.labels_print_one()}
            </Link>
          </Show>
          <span class="text-muted-foreground">
            {m.locations_counts({
              here: formatNumber(l().itemCount),
              total: formatNumber(l().totalCount),
            })}
          </span>
        </div>
        <Show when={l().notes}>
          <p class="whitespace-pre-line break-words">{l().notes}</p>
        </Show>
      </header>

      <div class="flex flex-wrap gap-2">
        <Show when={ctx().user.role !== "guest"}>
          <Link
            to="/items/new"
            search={{ loc: l().id }}
            class={buttonVariants({ variant: "default" })}
          >
            + {m.locations_add_item_here()}
          </Link>
        </Show>
        <Show when={l().canEdit}>
          <EditLocationDialog location={l()} />
          <MoveLocationDialog location={l()} />
        </Show>
        <DeleteLocationButton location={l()} isAdmin={ctx().user.role === "admin"} />
      </div>

      <section class="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="loc-children">
        <h2 id="loc-children" class="text-lg font-semibold">
          {m.locations_children()}
        </h2>
        <Show
          when={l().children.length}
          fallback={<p class="text-sm text-muted-foreground">{m.locations_no_children()}</p>}
        >
          <LocationTree nodes={l().children} label={m.locations_children()} />
        </Show>
        <Show when={l().canEdit}>
          <CreateLocationForm parentId={l().id} idPrefix="loc-child" />
        </Show>
      </section>

      <section class="grid gap-3" aria-labelledby="loc-items">
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="loc-items" class="mr-auto text-lg font-semibold">
            {m.locations_items_here()}
          </h2>
          <Show when={l().totalCount > l().itemCount || l().children.length}>
            <Link
              to="/items"
              search={{ loc: l().id }}
              class="text-sm text-primary underline-offset-4 hover:underline"
            >
              {m.locations_items_all({ count: formatNumber(l().totalCount) })}
            </Link>
          </Show>
        </div>
        <ItemResults
          input={contentsInput(l().id)}
          view="list"
          label={m.locations_items_in({ name: l().name })}
          empty={<p class="text-sm text-muted-foreground">{m.locations_items_empty()}</p>}
        />
      </section>
    </div>
  );
}
