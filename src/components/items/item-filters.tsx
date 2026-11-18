// Filter controls of the items list, driven by searchFacetsFn (counts of
// visible items). Every change goes straight into the URL (ItemsSearch), so
// the panel is just a view of the URL state.
import { createEffect, createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { inputClass } from "~/components/ui/input";
import { cn } from "~/lib/cn";
import { formatNumber, parseDecimalDe } from "~/lib/format";
import { buildTree, flattenTree } from "~/lib/item-types/tree";
import type { ItemStatus } from "~/lib/items/constants";
import type { AttributeFilter } from "~/lib/items/inputs";
import { statusLabel } from "~/lib/items/labels";
import {
  activeFilterCount,
  type ItemsSearch,
  ownerToken,
  patchSearch,
  setAttributeFilter,
} from "~/lib/items/list-search";
import type { AttributeFacet, SearchFacets } from "~/lib/items/types";
import { m } from "~/paraglide/messages";

type Props = {
  search: ItemsSearch;
  facets: SearchFacets | undefined;
  onChange: (next: ItemsSearch) => void;
  /** Guests own nothing: hide "only mine" and owner filters. */
  showOwnership: boolean;
};

const toggle = <T,>(list: T[] | undefined, v: T, on: boolean): T[] => {
  const rest = (list ?? []).filter((x) => x !== v);
  return on ? [...rest, v] : rest;
};

function Group(props: { title: string; children: JSX.Element }) {
  return (
    <fieldset class="grid gap-1">
      <legend class="mb-1 text-sm font-semibold">{props.title}</legend>
      {props.children}
    </fieldset>
  );
}

/** The location select's value for "no location, no container". */
const UNPLACED = "__unplaced";

const showEuros = (v: number | undefined) =>
  v === undefined ? "" : formatNumber(v).replace(/\./g, "");

/**
 * A euro range ("von"/"bis"); German decimals ("12,50"). Applies on change.
 * Both bounds are kept locally, so changing "bis" right after "von" (before the
 * URL has caught up) never sends a stale "von".
 */
function PriceFilter(props: {
  min: number | undefined;
  max: number | undefined;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  const [min, setMin] = createSignal(props.min);
  const [max, setMax] = createSignal(props.max);
  createEffect(() => setMin(props.min));
  createEffect(() => setMax(props.max));
  const parse = (raw: string) => {
    if (!raw.trim()) return undefined;
    const v = parseDecimalDe(raw);
    return v === null || v < 0 ? undefined : v;
  };
  return (
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm font-semibold">{m.items_filter_price()}</legend>
      <div class="grid grid-cols-2 gap-2">
        <label class="grid gap-1 text-sm">
          {m.items_filter_min()}
          <input
            id="filter-price-min"
            class={inputClass}
            type="text"
            inputmode="decimal"
            value={showEuros(min())}
            onChange={(e) => {
              setMin(parse(e.currentTarget.value));
              props.onChange(min(), max());
            }}
          />
        </label>
        <label class="grid gap-1 text-sm">
          {m.items_filter_max()}
          <input
            id="filter-price-max"
            class={inputClass}
            type="text"
            inputmode="decimal"
            value={showEuros(max())}
            onChange={(e) => {
              setMax(parse(e.currentTarget.value));
              props.onChange(min(), max());
            }}
          />
        </label>
      </div>
    </fieldset>
  );
}

const countLabel = (label: string, n: number) => `${label} (${formatNumber(n)})`;

export function ItemFilterControls(props: Props) {
  const s = () => props.search;
  const set = (patch: Partial<ItemsSearch>) => props.onChange(patchSearch(s(), patch));
  const types = createMemo(() =>
    flattenTree(buildTree(props.facets?.types ?? [])).map((t) => ({ ...t })),
  );
  const locations = createMemo(() => flattenTree(buildTree(props.facets?.locations ?? [])));
  const owners = () => props.facets?.owners ?? [];
  const statuses = () => props.facets?.statuses ?? [];
  const tags = () => props.facets?.tags ?? [];

  return (
    <div class="grid gap-5">
      <div class="grid gap-2">
        <label for="filter-type" class="text-sm font-semibold">
          {m.item_field_type()}
        </label>
        <select
          id="filter-type"
          class={inputClass}
          value={s().type ?? ""}
          onChange={(e) => set({ type: e.currentTarget.value || undefined })}
        >
          <option value="" selected={!s().type}>
            {m.items_filter_all_types()}
          </option>
          <For each={types()}>
            {(t) => (
              <option value={t.id} selected={t.id === s().type}>
                {"  ".repeat(t.depth)}
                {countLabel(t.name, t.total)}
              </option>
            )}
          </For>
        </select>
        <p class="text-xs text-muted-foreground">{m.items_filter_type_hint()}</p>
      </div>

      <Show when={props.facets?.attributes?.length}>
        <Group title={m.items_filter_attributes()}>
          <div class="grid gap-4">
            <For each={props.facets?.attributes ?? []}>
              {(f) => (
                <AttributeFilterControl
                  facet={f}
                  value={s().attr?.find((a) => a.key === f.key)}
                  onChange={(a) => props.onChange(setAttributeFilter(s(), a))}
                />
              )}
            </For>
          </div>
        </Group>
      </Show>

      <Show when={props.showOwnership}>
        <Checkbox
          class="min-h-11"
          label={m.items_filter_mine()}
          checked={!!s().mine}
          onChange={(on: boolean) => set({ mine: on || undefined })}
        />
        <Show when={owners().length}>
          <Group title={m.item_field_owner()}>
            <For each={owners()}>
              {(o) => (
                <Checkbox
                  class="min-h-11"
                  label={countLabel(o.name, o.count)}
                  checked={(s().owner ?? []).includes(ownerToken(o))}
                  onChange={(on: boolean) => set({ owner: toggle(s().owner, ownerToken(o), on) })}
                />
              )}
            </For>
          </Group>
        </Show>
      </Show>

      <Show when={locations().length || props.facets?.unplacedCount || s().unplaced}>
        <div class="grid gap-2">
          <label for="filter-location" class="text-sm font-semibold">
            {m.item_field_location()}
          </label>
          <select
            id="filter-location"
            class={inputClass}
            value={s().unplaced ? UNPLACED : (s().loc ?? "")}
            onChange={(e) => {
              const v = e.currentTarget.value;
              set(
                v === UNPLACED
                  ? { unplaced: true, loc: undefined }
                  : { unplaced: undefined, loc: v || undefined },
              );
            }}
          >
            <option value="" selected={!s().loc && !s().unplaced}>
              {m.items_filter_all_locations()}
            </option>
            <option value={UNPLACED} selected={!!s().unplaced}>
              {countLabel(m.items_filter_unplaced(), props.facets?.unplacedCount ?? 0)}
            </option>
            <For each={locations()}>
              {(l) => (
                <option value={l.id} selected={!s().unplaced && l.id === s().loc}>
                  {"  ".repeat(l.depth)}
                  {countLabel(l.name, l.total)}
                </option>
              )}
            </For>
          </select>
        </div>
      </Show>

      <Show when={props.facets?.priceAvailable || s().pmin !== undefined || s().pmax !== undefined}>
        <PriceFilter min={s().pmin} max={s().pmax} onChange={(pmin, pmax) => set({ pmin, pmax })} />
      </Show>

      <Group title={m.item_field_status()}>
        <For each={statuses()}>
          {(st) => (
            <Checkbox
              class="min-h-11"
              label={countLabel(statusLabel(st.status), st.count)}
              checked={(s().status ?? []).includes(st.status)}
              onChange={(on: boolean) =>
                set({ status: toggle<ItemStatus>(s().status, st.status, on) })
              }
            />
          )}
        </For>
        <Show when={!s().status?.length}>
          <Checkbox
            class="min-h-11"
            label={m.items_filter_include_gone()}
            checked={!!s().gone}
            onChange={(on: boolean) => set({ gone: on || undefined })}
          />
        </Show>
        <Checkbox
          class="min-h-11"
          label={m.items_filter_low_stock()}
          checked={!!s().low}
          onChange={(on: boolean) => set({ low: on || undefined })}
        />
        <Checkbox
          class="min-h-11"
          label={m.items_filter_warranty()}
          checked={!!s().warranty}
          onChange={(on: boolean) => set({ warranty: on || undefined })}
        />
      </Group>

      <Show when={tags().length}>
        <Group title={m.item_field_tags()}>
          <p class="text-xs text-muted-foreground">{m.items_filter_tags_hint()}</p>
          <div class="flex flex-wrap gap-2">
            <For each={tags()}>
              {(t) => {
                const on = () => (s().tag ?? []).includes(t.id);
                return (
                  <button
                    type="button"
                    aria-pressed={on()}
                    class={cn(
                      "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on()
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                    onClick={() => set({ tag: toggle(s().tag, t.id, !on()) })}
                  >
                    {countLabel(t.name, t.count)}
                  </button>
                );
              }}
            </For>
          </div>
        </Group>
      </Show>
    </div>
  );
}

function AttributeFilterControl(props: {
  facet: AttributeFacet;
  value: AttributeFilter | undefined;
  onChange: (f: AttributeFilter) => void;
}) {
  const f = () => props.facet;
  const id = () => `filter-attr-${f().key}`;
  const values = () => props.value?.values ?? [];
  return (
    <Show
      when={f().values}
      fallback={
        <Show when={f().range}>
          {(r) => (
            <RangeFilter facet={f()} range={r()} value={props.value} onChange={props.onChange} />
          )}
        </Show>
      }
    >
      {(vals) => (
        <fieldset class="grid gap-1" id={id()}>
          <legend class="mb-1 text-sm font-medium">{f().label}</legend>
          <For each={vals()}>
            {(v) => (
              <Checkbox
                class="min-h-11"
                label={countLabel(v.label, v.count)}
                checked={values().some((x) => x === v.value)}
                onChange={(on: boolean) => {
                  const rest = values().filter((x) => x !== v.value);
                  props.onChange({ key: f().key, values: on ? [...rest, v.value] : rest });
                }}
              />
            )}
          </For>
        </fieldset>
      )}
    </Show>
  );
}

function RangeFilter(props: {
  facet: AttributeFacet;
  range: NonNullable<AttributeFacet["range"]>;
  value: AttributeFilter | undefined;
  onChange: (f: AttributeFilter) => void;
}) {
  const isDate = () => props.facet.kind === "date";
  const show = (v: number | string | undefined) =>
    v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : v;
  const parse = (s: string): number | string | undefined => {
    if (!s.trim()) return undefined;
    if (isDate()) return s;
    return parseDecimalDe(s) ?? undefined;
  };
  // Kept locally like PriceFilter: a quick second change must not send a stale bound.
  const [cur, setCur] = createSignal({ min: props.value?.min, max: props.value?.max });
  createEffect(() => setCur({ min: props.value?.min, max: props.value?.max }));
  const apply = (which: "min" | "max", raw: string) => {
    setCur({ ...cur(), [which]: parse(raw) });
    const next: AttributeFilter = { key: props.facet.key };
    const { min, max } = cur();
    if (min !== undefined) next.min = min;
    if (max !== undefined) next.max = max;
    props.onChange(next);
  };
  const hint = () =>
    props.range.min !== null && props.range.max !== null
      ? m.items_filter_range_hint({ min: show(props.range.min), max: show(props.range.max) })
      : "";
  const base = () => `filter-attr-${props.facet.key}`;
  return (
    <fieldset class="grid gap-2">
      <legend class="mb-1 text-sm font-medium">
        {props.facet.label}
        <Show when={props.facet.unit}> ({props.facet.unit})</Show>
      </legend>
      <div class="grid grid-cols-2 gap-2">
        <label class="grid gap-1 text-sm">
          {m.items_filter_min()}
          <input
            id={`${base()}-min`}
            class={inputClass}
            type={isDate() ? "date" : "text"}
            inputmode={isDate() ? undefined : "decimal"}
            value={show(cur().min)}
            onChange={(e) => apply("min", e.currentTarget.value)}
          />
        </label>
        <label class="grid gap-1 text-sm">
          {m.items_filter_max()}
          <input
            id={`${base()}-max`}
            class={inputClass}
            type={isDate() ? "date" : "text"}
            inputmode={isDate() ? undefined : "decimal"}
            value={show(cur().max)}
            onChange={(e) => apply("max", e.currentTarget.value)}
          />
        </label>
      </div>
      <Show when={hint()}>
        <p class="text-xs text-muted-foreground">{hint()}</p>
      </Show>
    </fieldset>
  );
}

/** The "Filter (n)" button with the controls in a sheet. */
export function ItemFilterSheet(props: Props & { total?: number }) {
  const [open, setOpen] = createSignal(false);
  const n = () => activeFilterCount(props.search);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {n() ? m.items_filter_button_count({ count: n() }) : m.items_filter_button()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent class="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{m.items_filter_title()}</DialogTitle>
          </DialogHeader>
          <ItemFilterControls {...props} />
          <DialogFooter class="sticky bottom-0 z-10 -mx-5 -mb-5 border-t bg-background p-4">
            <Show when={n()}>
              <Button
                variant="outline"
                onClick={() =>
                  props.onChange({
                    q: props.search.q,
                    sort: props.search.sort,
                    view: props.search.view,
                  })
                }
              >
                {m.items_filter_reset()}
              </Button>
            </Show>
            <Button onClick={() => setOpen(false)}>
              {props.total === undefined
                ? m.common_close()
                : m.items_filter_show({ count: formatNumber(props.total) })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Active filters as removable chips (outside the sheet). */
export function ActiveFilterChips(props: Props) {
  const s = () => props.search;
  const chips = createMemo(() => {
    const f = props.facets;
    const out: { label: string; remove: () => ItemsSearch }[] = [];
    if (s().type) {
      const t = f?.types.find((x) => x.id === s().type);
      out.push({
        label: t?.name ?? m.item_field_type(),
        remove: () => patchSearch(s(), { type: undefined }),
      });
    }
    for (const a of s().type ? (s().attr ?? []) : []) {
      const facet = f?.attributes?.find((x) => x.key === a.key);
      const vals = (a.values ?? []).map(
        (v) => facet?.values?.find((x) => x.value === v)?.label ?? String(v),
      );
      const range = [a.min, a.max].some((x) => x !== undefined)
        ? `${a.min ?? "…"}–${a.max ?? "…"}`
        : "";
      out.push({
        label: `${facet?.label ?? a.key}: ${[...vals, range].filter(Boolean).join(", ")}`,
        remove: () => setAttributeFilter(s(), { key: a.key }),
      });
    }
    if (s().mine)
      out.push({
        label: m.items_filter_mine(),
        remove: () => patchSearch(s(), { mine: undefined }),
      });
    for (const o of s().owner ?? []) {
      const name = f?.owners.find((x) => ownerToken(x) === o)?.name ?? m.items_owner_unknown();
      out.push({
        label: name,
        remove: () => patchSearch(s(), { owner: toggle(s().owner, o, false) }),
      });
    }
    if (s().unplaced)
      out.push({
        label: m.items_filter_unplaced_chip(),
        remove: () => patchSearch(s(), { unplaced: undefined }),
      });
    if (s().pmin !== undefined || s().pmax !== undefined)
      out.push({
        label: m.items_filter_price_chip({
          range: `${s().pmin !== undefined ? formatNumber(s().pmin!) : "…"}–${
            s().pmax !== undefined ? formatNumber(s().pmax!) : "…"
          } €`,
        }),
        remove: () => patchSearch(s(), { pmin: undefined, pmax: undefined }),
      });
    if (s().loc) {
      const l = f?.locations.find((x) => x.id === s().loc);
      out.push({
        label: l?.name ?? m.item_field_location(),
        remove: () => patchSearch(s(), { loc: undefined }),
      });
    }
    for (const st of s().status ?? [])
      out.push({
        label: statusLabel(st),
        remove: () => patchSearch(s(), { status: toggle(s().status, st, false) }),
      });
    if (s().gone)
      out.push({
        label: m.items_filter_include_gone(),
        remove: () => patchSearch(s(), { gone: undefined }),
      });
    if (s().low)
      out.push({
        label: m.items_filter_low_stock(),
        remove: () => patchSearch(s(), { low: undefined }),
      });
    if (s().warranty)
      out.push({
        label: m.items_filter_warranty(),
        remove: () => patchSearch(s(), { warranty: undefined }),
      });
    for (const t of s().tag ?? []) {
      const tag = f?.tags.find((x) => x.id === t);
      out.push({
        label: `#${tag?.name ?? "?"}`,
        remove: () => patchSearch(s(), { tag: toggle(s().tag, t, false) }),
      });
    }
    return out;
  });
  return (
    <Show when={chips().length}>
      <ul class="flex flex-wrap gap-2" aria-label={m.items_filter_active()}>
        <For each={chips()}>
          {(c) => (
            <li>
              <button
                type="button"
                class="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border bg-secondary px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={m.items_filter_remove({ name: c.label })}
                onClick={() => props.onChange(c.remove())}
              >
                <span class="truncate">{c.label}</span>
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
