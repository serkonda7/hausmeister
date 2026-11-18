// Enum values for items, locations and search, shared by client and server.
// Kept in sync with src/server/db/schema.ts by a test (constants.test.ts).

/** DESIGN §4.6. */
export const ITEM_STATUSES = [
  "available",
  "in_use",
  "on_loan",
  "needs_repair",
  "lost",
  "outgrown",
  "archived",
  "given_away",
  "sold",
  "disposed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/**
 * Statuses that mean "gone": hidden from default lists and search (DESIGN §4.6),
 * still reachable by explicit status filter, includeGone, short code and history.
 * `lost` and `outgrown` are NOT gone: a lost thing may turn up, an outgrown one
 * is waiting to be handed down.
 */
export const GONE_STATUSES = [
  "archived",
  "given_away",
  "sold",
  "disposed",
] as const satisfies readonly ItemStatus[];

/** Setting (or leaving) one of these needs `manage`; every other status change needs `use`. */
export const MANAGE_STATUSES: readonly ItemStatus[] = GONE_STATUSES;

export const isGoneStatus = (s: ItemStatus) => (GONE_STATUSES as readonly string[]).includes(s);

export const OWNER_KINDS = ["household", "user", "group"] as const;
export const VISIBILITIES = ["household", "private"] as const;
export const GRANT_LEVELS = ["view", "use", "edit", "manage"] as const;
export const PRINCIPAL_KINDS = ["user", "group"] as const;

export const LOCATION_KINDS = [
  "building",
  "room",
  "area",
  "furniture",
  "shelf",
  "drawer",
  "box",
  "other",
] as const;
export type LocationKind = (typeof LOCATION_KINDS)[number];

/**
 * List sort orders. `relevance` needs a search text of >= 3 characters (falls
 * back to name_asc otherwise). Price sorts put rows whose price the caller may
 * not see (or that have none) last, as if they had no price.
 */
export const ITEM_SORTS = [
  "relevance",
  "name_asc",
  "name_desc",
  "updated_desc",
  "updated_asc",
  "created_desc",
  "created_asc",
  "price_asc",
  "price_desc",
] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export const SEARCH_PAGE_DEFAULT = 50;
export const SEARCH_PAGE_MAX = 200;
/** FTS5 trigram needs 3 characters; shorter queries use a name prefix match. */
export const SEARCH_MIN_FTS = 3;

/** Why a stock quantity changed (DESIGN §4.2). "edited" is a quantity change in the item form. */
export const STOCK_REASONS = ["used", "restocked", "counted", "edited", "other"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];
/** The reasons a person picks when adjusting stock (not "edited"). */
export const STOCK_ADJUST_REASONS = [
  "used",
  "restocked",
  "counted",
  "other",
] as const satisfies readonly StockReason[];

export const TAG_NAME_MAX = 40;
export const ITEM_NAME_MAX = 200;
