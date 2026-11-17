// Where an item goes: a location from the tree, or inside a container item.
// Used by the item form (create) and the move action on the item page.
//
//   <LocationPicker id="place" value={place()} onChange={setPlace} excludeItemId={item.id} />
import { useQuery } from "@tanstack/solid-query";
import { createMemo, createUniqueId, For, Show } from "solid-js";
import { ItemPicker, searchVisibleItems } from "~/components/item-types/pickers";
import { inputClass } from "~/components/ui/input";
import { flattenTree } from "~/lib/item-types/tree";
import { locationsQuery } from "~/lib/items/queries";
import type { LocationNode } from "~/lib/items/types";
import { m } from "~/paraglide/messages";
import { pickItemsFn } from "~/server/search/functions";

/** containerItemId "" = "in a container" chosen, but no container picked yet. */
export type Placement = { locationId: string | null; containerItemId: string | null };

/** Placement -> createItemFn / moveItemFn fields. */
export const placementInput = (p: Placement) =>
  p.containerItemId
    ? { containerItemId: p.containerItemId }
    : { locationId: p.locationId, containerItemId: null };

/** "Garage › Regal 2" for every location id. */
export function locationLabels(roots: readonly LocationNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (list: readonly LocationNode[], prefix: string) => {
    for (const n of list) {
      const label = prefix ? `${prefix} › ${n.name}` : n.name;
      out.set(n.id, label);
      walk(n.children, label);
    }
  };
  walk(roots, "");
  return out;
}

/** Native select over the location tree (indented), for forms and filters. */
export function LocationSelect(props: {
  id: string;
  value: string | null;
  onChange: (id: string | null) => void;
  noneLabel: string;
  /** Leave this location and its subtree out (moving a location). */
  excludeSubtreeOf?: string;
  describedBy?: string;
  disabled?: boolean;
  class?: string;
}) {
  const q = useQuery(() => locationsQuery());
  const options = createMemo(() => {
    const flat = flattenTree(q.data ?? []);
    if (!props.excludeSubtreeOf) return flat;
    const skip = new Set<string>([props.excludeSubtreeOf]);
    for (const n of flat) if (n.parentId && skip.has(n.parentId)) skip.add(n.id);
    return flat.filter((n) => !skip.has(n.id));
  });
  return (
    <select
      id={props.id}
      class={props.class ?? inputClass}
      value={props.value ?? ""}
      aria-describedby={props.describedBy}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.currentTarget.value || null)}
    >
      <option value="" selected={!props.value}>
        {props.noneLabel}
      </option>
      <For each={options()}>
        {(n) => (
          <option value={n.id} selected={n.id === props.value}>
            {"  ".repeat(n.depth)}
            {n.name}
          </option>
        )}
      </For>
    </select>
  );
}

export function LocationPicker(props: {
  id?: string;
  value: Placement;
  onChange: (p: Placement) => void;
  /** The item being placed (it cannot go into itself). */
  excludeItemId?: string;
  /** Name of the current container, if it came from the server. */
  containerName?: string;
  disabled?: boolean;
}) {
  const base = props.id ?? createUniqueId();
  const mode = () => (props.value.containerItemId ? "container" : "location");
  const search = (q: string) =>
    props.excludeItemId
      ? pickItemsFn({ data: { q, excludeId: props.excludeItemId } })
      : searchVisibleItems(q);
  return (
    <fieldset class="grid gap-3">
      <legend class="mb-1 text-sm font-medium">{m.item_place_legend()}</legend>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <label class="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name={`${base}-mode`}
            class="size-4 accent-primary"
            checked={mode() === "location"}
            disabled={props.disabled}
            onChange={() => props.onChange({ locationId: null, containerItemId: null })}
          />
          {m.item_place_in_location()}
        </label>
        <label class="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name={`${base}-mode`}
            class="size-4 accent-primary"
            checked={mode() === "container"}
            disabled={props.disabled}
            onChange={() => props.onChange({ locationId: null, containerItemId: "" })}
          />
          {m.item_place_in_container()}
        </label>
      </div>
      <Show
        when={props.value.containerItemId !== null}
        fallback={
          <div class="grid gap-2">
            <label for={`${base}-loc`} class="text-sm font-medium">
              {m.item_field_location()}
            </label>
            <LocationSelect
              id={`${base}-loc`}
              value={props.value.locationId}
              onChange={(locationId) => props.onChange({ locationId, containerItemId: null })}
              noneLabel={m.item_no_location()}
              disabled={props.disabled}
            />
          </div>
        }
      >
        <div class="grid gap-2">
          <label for={`${base}-container`} class="text-sm font-medium">
            {m.item_field_container()}
          </label>
          <ItemPicker
            id={`${base}-container`}
            label={m.item_field_container()}
            value={props.value.containerItemId || undefined}
            onChange={(v) =>
              props.onChange({
                locationId: null,
                containerItemId: typeof v === "string" ? v : "",
              })
            }
            search={search}
            itemName={(id) =>
              id === props.value.containerItemId ? props.containerName : undefined
            }
            disabled={props.disabled}
          />
        </div>
      </Show>
    </fieldset>
  );
}
