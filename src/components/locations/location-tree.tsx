// Nested list of locations with visible item counts (incl. sub-locations).
import { Link } from "@tanstack/solid-router";
import { For, Show } from "solid-js";
import { formatNumber } from "~/lib/format";
import { locationKindLabel } from "~/lib/items/labels";
import type { LocationNode, LocationSummary } from "~/lib/items/types";
import { m } from "~/paraglide/messages";

export function LocationTree(props: {
  nodes: (LocationNode | (LocationSummary & { children?: LocationNode[] }))[];
  label?: string;
}) {
  return (
    <ul class="grid gap-1" aria-label={props.label}>
      <For each={props.nodes}>
        {(n) => (
          <li>
            <Link
              to="/locations/$locationId"
              params={{ locationId: n.id }}
              class="flex min-h-11 items-center gap-2 rounded-md px-2 py-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span class="min-w-0 flex-1 break-words font-medium">{n.name}</span>
              <Show when={n.kind}>
                {(k) => <span class="text-xs text-muted-foreground">{locationKindLabel(k())}</span>}
              </Show>
              <span class="shrink-0 text-sm text-muted-foreground">
                <span class="sr-only">{m.locations_items_total()}: </span>
                {formatNumber(n.totalCount)}
              </span>
            </Link>
            <Show when={n.children?.length}>
              <div class="ml-3 border-l pl-2">
                <LocationTree nodes={n.children ?? []} />
              </div>
            </Show>
          </li>
        )}
      </For>
    </ul>
  );
}
