// Shapes returned by the items, locations, tags, search and history server
// functions (see AGENTS.md "Items, locations, search"). Money fields only
// exist on rows serialized at `edit` or above (discriminated by `level`).
import type { MigrationPlan } from "~/lib/item-types/migrate";
import type { EffectiveField, TreeNode } from "~/lib/item-types/tree";
import type { SerializedAttachment, SerializedItem } from "~/server/authz";
import type { GrantLevel, Item } from "~/server/db/schema";
import type { ItemSort, ItemStatus, LocationKind } from "./constants";

export type OwnerKind = Item["ownerKind"];
/** What JSON columns (attributes, event diffs) hold, typed so server functions can return it. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
/** An item row as it leaves the server: attributes typed as JSON. */
export type ItemRow = Omit<Item, "nameSort" | "attributes"> & { attributes: JsonObject };
export type TagRef = { id: string; name: string; color: string | null };
export type OwnerRef = { kind: OwnerKind; id: string | null; name: string };

/**
 * One step of an item's path, root first: locations, then containers, then
 * (never) the item itself. A container the caller cannot see is `hidden`
 * (no id, no name); consecutive hidden containers collapse into one.
 */
export type Crumb =
  | { kind: "location"; id: string; name: string; shortCode: string | null }
  | { kind: "item"; id: string; name: string; shortCode: string | null }
  | { kind: "hidden" };

/** The item columns a list row is serialized from. */
export type ListRowSource = Pick<
  Item,
  | "id"
  | "name"
  | "shortCode"
  | "typeId"
  | "status"
  | "ownerKind"
  | "ownerId"
  | "visibility"
  | "locationId"
  | "containerItemId"
  | "quantity"
  | "unit"
  | "minQuantity"
  | "priceCents"
  | "currency"
  | "createdAt"
  | "updatedAt"
  | "version"
>;

export type ListRowExtras = {
  typeName: string;
  typeIcon: string | null;
  owner: OwnerRef;
  locationName: string | null;
  gone: boolean;
  /** minQuantity set and quantity below it. */
  lowStock: boolean;
  tags: TagRef[];
  /** First photo attachment (serve via /files/:id), or null. */
  photoId: string | null;
};

/**
 * A row of searchItems. containerItemId is null when the container is not
 * visible to the caller. priceCents/currency only when level is edit|manage.
 */
export type ItemListRow = SerializedItem<ListRowSource> & ListRowExtras;

export type ItemPage = {
  items: ItemListRow[];
  /** Pass as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
  /** Number of matching items (all pages). */
  total: number;
  /** The sort actually used (relevance falls back to name_asc without FTS). */
  sort: ItemSort;
  /** "prefix": the search text was too short for FTS, a name prefix match was used. */
  mode: "all" | "fts" | "prefix";
};

export type PickedItem = { id: string; name: string; shortCode: string | null; typeName: string };

export type GrantRow = {
  principalKind: "user" | "group";
  principalId: string;
  name: string;
  level: GrantLevel;
  /** For guests the role ceiling caps grants at `use`. */
  isGuest: boolean;
};

export type ItemPermissions = {
  canUse: boolean;
  canEdit: boolean;
  canManage: boolean;
  /** Admin, or the item's direct user owner (DESIGN §3.6 until transfers exist). */
  canChangeOwner: boolean;
};

export type ItemDetail = {
  /**
   * The item (attributes in full, legacy values included, except ids of items the
   * caller cannot see: see hiddenReferences). No money below edit.
   */
  item: SerializedItem<ItemRow>;
  type: {
    id: string;
    name: string;
    icon: string | null;
    tracking: "individual" | "stock";
    archived: boolean;
    /** Inherited + own fields, hidden ones included (activeFields() for forms). */
    effectiveFields: EffectiveField[];
  };
  owner: OwnerRef;
  tags: TagRef[];
  /** Location chain plus container chain, root first. */
  path: Crumb[];
  /** Visible items directly inside this item. */
  contentsCount: number;
  /** Visible attachments (receipts only at edit+), ordered by sort. */
  attachments: SerializedAttachment[];
  /** Names for ids in `user`/`item` attributes; invisible items are left out. */
  references: { users: Record<string, string>; items: Record<string, string> };
  /**
   * `item` fields whose value references items the caller cannot see: key ->
   * how many ids were left out of `item.attributes`. Saving keeps them.
   */
  hiddenReferences: Record<string, number>;
  permissions: ItemPermissions;
  /** The item's grants; only for callers with manage, otherwise null. */
  grants: GrantRow[] | null;
};

export type TypeChangeResult =
  | {
      status: "preview";
      plan: Omit<MigrationPlan, "attributes">;
      /** The attributes the item would have (legacy values included). */
      attributes: JsonObject;
    }
  | { status: "saved"; version: number };

export type LocationSummary = {
  id: string;
  parentId: string | null;
  name: string;
  kind: LocationKind | null;
  shortCode: string | null;
  notes: string | null;
  /** Visible items with this location (inside containers too). */
  itemCount: number;
  /** Visible items in this location and all sub-locations. */
  totalCount: number;
};
export type LocationNode = TreeNode<LocationSummary>;

export type LocationDetail = LocationSummary & {
  /** Ancestors, root first (the location itself not included). */
  path: { id: string; name: string; shortCode: string | null }[];
  children: LocationSummary[];
  canEdit: boolean;
  canDelete: boolean;
};

export type TagSummary = TagRef & { count: number };

export type FacetCount<T> = T & { count: number };
export type AttributeFacet = {
  key: string;
  label: string;
  kind: EffectiveField["kind"];
  unit?: string;
  /** Value filters (select, multiselect, boolean, size, user, ...): values with counts. */
  values?: { value: string | number | boolean; label: string; count: number }[];
  /** Range filters (integer, decimal, measure, date): observed bounds. */
  range?: { min: number | string | null; max: number | string | null };
};
export type SearchFacets = {
  /** All non-archived types with counts (direct, and incl. subtypes). */
  types: FacetCount<{
    id: string;
    parentId: string | null;
    name: string;
    icon: string | null;
    total: number;
  }>[];
  owners: FacetCount<OwnerRef>[];
  locations: FacetCount<{
    id: string;
    parentId: string | null;
    name: string;
    total: number;
  }>[];
  tags: FacetCount<TagRef>[];
  statuses: FacetCount<{ status: ItemStatus; gone: boolean }>[];
  /** Only when a typeId filter is set: its filterable attributes. */
  attributes: AttributeFacet[] | null;
  /** Price filter/sort is meaningful (some matching item shows its price). */
  priceAvailable: boolean;
  /** Visible items with neither a location nor a container (location filter left out). */
  unplacedCount: number;
};

export type HistoryActor = { id: string; name: string } | null;
export type HistoryEntry = {
  id: string;
  at: Date;
  /** e.g. item.created, item.updated, item.moved, attachment.added (see AGENTS.md). */
  action: string;
  actor: HistoryActor;
  /** Field diffs ({ key: { from, to } }) or action-specific data, redacted for the caller. */
  diff: JsonObject;
};
export type HistoryPage = {
  entries: HistoryEntry[];
  nextCursor: string | null;
  /** Names for ids appearing in diffs; items and locations only if visible to the caller. */
  names: {
    users: Record<string, string>;
    groups: Record<string, string>;
    items: Record<string, string>;
    locations: Record<string, string>;
  };
};

export type ShortCodeTarget = { kind: "item"; id: string } | { kind: "location"; id: string };
