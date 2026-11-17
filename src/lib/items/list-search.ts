// The items list's filter state as it lives in the URL (/items?…), so a
// filtered view can be bookmarked, shared, reloaded and walked with back and
// forward. Pure: parse the router's raw search object, clean it for
// navigation, and turn it into searchItemsFn / searchFacetsFn input.
//
//   validateSearch: parseItemsSearch            (route)
//   toSearchFilters(search) / toSearchInput(search)
//   navigate({ search: (s) => patchSearch(s, { type: id }) })
import { z } from "zod";
import { ITEM_SORTS, ITEM_STATUSES, type ItemSort, type ItemStatus } from "./constants";
import {
  type AttributeFilter,
  attributeFilterInput,
  type SearchFilters,
  type SearchItemsInput,
} from "./inputs";

export const ITEM_VIEWS = ["grid", "list"] as const;
export type ItemView = (typeof ITEM_VIEWS)[number];

/** An owner filter as a URL token: "household", "user:<id>" or "group:<id>". */
export type OwnerToken = string;

export type ItemsSearch = {
  q?: string;
  type?: string;
  owner?: OwnerToken[];
  loc?: string;
  status?: ItemStatus[];
  tag?: string[];
  mine?: boolean;
  gone?: boolean;
  low?: boolean;
  /** Neither a location nor a container ("noch nicht weggeräumt"). Wins over `loc`. */
  unplaced?: boolean;
  /** Price range in euros (inclusive); the server only matches prices the caller may see. */
  pmin?: number;
  pmax?: number;
  sort?: ItemSort;
  view?: ItemView;
  /** Attribute filters of the chosen type (ignored without `type`). */
  attr?: AttributeFilter[];
};

const id = z.string().min(1).max(64);
const ownerTokenSchema = z.string().regex(/^(household|(user|group):[^\s:]{1,64})$/);
/** Euros in the URL: "12", "12.5" or "12,50"; at most two decimals, 0..1e10. */
const euros = z
  .union([z.number(), z.string().transform((v) => Number(v.trim().replace(",", ".")))])
  .pipe(z.number().finite().min(0).max(1e10))
  .transform((v) => Math.round(v * 100) / 100);
const flag = z
  .union([z.boolean(), z.literal("1"), z.literal("true"), z.literal(1)])
  .transform(() => true);

/** Drops one bad entry rather than the whole list. */
function listOf<T>(schema: z.ZodType<T>, max: number, raw: unknown): T[] | undefined {
  const arr = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const out: T[] = [];
  for (const v of arr) {
    const r = schema.safeParse(v);
    if (r.success && !out.some((x) => JSON.stringify(x) === JSON.stringify(r.data)))
      out.push(r.data);
    if (out.length >= max) break;
  }
  return out.length ? out : undefined;
}

function one<T>(schema: z.ZodType<T>, raw: unknown): T | undefined {
  const r = schema.safeParse(raw);
  return r.success ? r.data : undefined;
}

/**
 * The router's raw search object -> ItemsSearch. Never throws: unknown keys
 * and invalid values are dropped, so an old or hand-edited link still opens.
 */
export function parseItemsSearch(raw: Record<string, unknown>): ItemsSearch {
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 200) : undefined;
  const type = one(id, raw.type);
  const out: ItemsSearch = {
    q: q || undefined,
    type,
    owner: listOf(ownerTokenSchema, 50, raw.owner),
    loc: one(id, raw.loc),
    status: listOf(z.enum(ITEM_STATUSES), ITEM_STATUSES.length, raw.status),
    tag: listOf(id, 20, raw.tag),
    mine: one(flag, raw.mine),
    gone: one(flag, raw.gone),
    low: one(flag, raw.low),
    unplaced: one(flag, raw.unplaced),
    pmin: one(euros, raw.pmin),
    pmax: one(euros, raw.pmax),
    sort: one(z.enum(ITEM_SORTS), raw.sort),
    view: one(z.enum(ITEM_VIEWS), raw.view),
    attr: type ? listOf(attributeFilterInput, 20, raw.attr) : undefined,
  };
  return cleanSearch(out);
}

/** Removes empty and default values (keeps URLs short and comparable). */
export function cleanSearch(s: ItemsSearch): ItemsSearch {
  const out: ItemsSearch = {};
  if (s.q?.trim()) out.q = s.q.trim();
  if (s.type) out.type = s.type;
  if (s.owner?.length) out.owner = s.owner;
  if (s.unplaced) out.unplaced = true;
  else if (s.loc) out.loc = s.loc;
  if (s.status?.length) out.status = s.status;
  if (s.tag?.length) out.tag = s.tag;
  if (s.mine) out.mine = true;
  if (s.gone && !s.status?.length) out.gone = true;
  if (s.low) out.low = true;
  if (s.pmin !== undefined) out.pmin = s.pmin;
  if (s.pmax !== undefined) out.pmax = s.pmax;
  if (s.sort && s.sort !== defaultSort(s)) out.sort = s.sort;
  if (s.view && s.view !== "grid") out.view = s.view;
  const attr = s.type ? s.attr?.filter(isActiveAttributeFilter) : undefined;
  if (attr?.length) out.attr = attr;
  return out;
}

/** Relevance while searching, otherwise alphabetical. */
export const defaultSort = (s: Pick<ItemsSearch, "q">): ItemSort =>
  s.q?.trim() ? "relevance" : "name_asc";

export function isActiveAttributeFilter(f: AttributeFilter): boolean {
  return (f.values?.length ?? 0) > 0 || f.min !== undefined || f.max !== undefined;
}

/**
 * Applies a patch and cleans the result. Changing the type drops attribute
 * filters (they belong to the old type); `undefined` clears a key.
 */
export function patchSearch(s: ItemsSearch, patch: Partial<ItemsSearch>): ItemsSearch {
  const next: ItemsSearch = { ...s, ...patch };
  if ("type" in patch && patch.type !== s.type && !("attr" in patch)) next.attr = undefined;
  return cleanSearch(next);
}

/** Sets (or, with an inactive filter, removes) the filter for one attribute key. */
export function setAttributeFilter(s: ItemsSearch, f: AttributeFilter): ItemsSearch {
  const rest = (s.attr ?? []).filter((x) => x.key !== f.key);
  return cleanSearch({ ...s, attr: isActiveAttributeFilter(f) ? [...rest, f] : rest });
}

export function parseOwnerToken(
  t: OwnerToken,
): { ownerKind: "household" } | { ownerKind: "user" | "group"; ownerId: string } | null {
  if (t === "household") return { ownerKind: "household" };
  const i = t.indexOf(":");
  const kind = t.slice(0, i);
  const ownerId = t.slice(i + 1);
  if ((kind === "user" || kind === "group") && ownerId) return { ownerKind: kind, ownerId };
  return null;
}

export const ownerToken = (o: { kind: "household" | "user" | "group"; id: string | null }) =>
  o.kind === "household" ? "household" : `${o.kind}:${o.id}`;

/** Filters for searchFacetsFn and the list (no sort, cursor or view). */
export function toSearchFilters(s: ItemsSearch): SearchFilters {
  const f: SearchFilters = {};
  if (s.q) f.q = s.q;
  if (s.type) f.typeId = s.type;
  const owners = (s.owner ?? []).map(parseOwnerToken).filter((o) => o !== null);
  if (owners.length) f.owners = owners;
  if (s.mine) f.mine = true;
  if (s.unplaced) f.unplaced = true;
  else if (s.loc) f.locationId = s.loc;
  if (s.pmin !== undefined) f.priceMin = Math.round(s.pmin * 100);
  if (s.pmax !== undefined) f.priceMax = Math.round(s.pmax * 100);
  if (s.status?.length) f.statuses = s.status;
  else if (s.gone) f.includeGone = true;
  if (s.tag?.length) f.tagIds = s.tag;
  if (s.low) f.lowStock = true;
  const attr = s.type ? (s.attr ?? []).filter(isActiveAttributeFilter) : [];
  if (attr.length) f.attributes = attr;
  return f;
}

export function toSearchInput(s: ItemsSearch): SearchItemsInput {
  return { ...toSearchFilters(s), sort: s.sort ?? defaultSort(s) };
}

/** Number of active filters besides the search text, sort and view (for the "Filter (3)" button). */
export function activeFilterCount(s: ItemsSearch): number {
  return (
    (s.type ? 1 : 0) +
    (s.owner?.length ?? 0) +
    (s.loc || s.unplaced ? 1 : 0) +
    (s.pmin !== undefined || s.pmax !== undefined ? 1 : 0) +
    (s.status?.length ?? 0) +
    (s.tag?.length ?? 0) +
    (s.mine ? 1 : 0) +
    (s.gone ? 1 : 0) +
    (s.low ? 1 : 0) +
    (s.type ? (s.attr ?? []).filter(isActiveAttributeFilter).length : 0)
  );
}
