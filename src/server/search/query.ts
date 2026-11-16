// The one list/search query (DESIGN §5.4). Every list of items (search page,
// location contents, container contents, item picker, facets) goes through
// buildConditions + the visibility predicate here; nothing filters items in JS.
//
// Search text: normalized like the index (normalizeSearchText), split into
// words. Words of >= 3 characters go to FTS5 (trigram: substring matches,
// "schrauber" finds "Akkuschrauber"); shorter words additionally have to occur
// in the name. If no word has 3 characters, each word must be a prefix of the
// name or of a word in it (LIKE on items.name_sort).
//
// Pagination is keyset-based: the cursor holds the sort key of the last row
// plus its id (tie-breaker), so pages stay stable while items are added or
// changed and every page is an index range scan for name/updated sorts.
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { formatSizeValue } from "../../lib/item-types/display";
import { activeFields, isMultiple } from "../../lib/item-types/fields";
import {
  type EffectiveField,
  resolveFields,
  typeAndDescendantIds,
} from "../../lib/item-types/tree";
import {
  GONE_STATUSES,
  ITEM_STATUSES,
  type ItemSort,
  isGoneStatus,
  SEARCH_MIN_FTS,
  SEARCH_PAGE_DEFAULT,
} from "../../lib/items/constants";
import {
  type AttributeFilter,
  type SearchFilters,
  type SearchItemsInput,
  searchFiltersInput,
  searchItemsInput,
} from "../../lib/items/inputs";
import type {
  AttributeFacet,
  ItemListRow,
  ItemPage,
  ListRowSource,
  OwnerRef,
  PickedItem,
  SearchFacets,
  TagRef,
} from "../../lib/items/types";
import { normalizeSearchText } from "../../lib/normalize";
import { m } from "../../paraglide/messages";
import { moneyVisibleWhere, serializeItemsForCtx, visibleItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import {
  attachments,
  groups,
  items,
  itemTags,
  itemTypes,
  locations,
  settings,
  tags,
  users,
} from "../db/schema";
import { loadTypes } from "../item-types/service";
import { ItemsError, parseInput } from "../items/errors";
import { visibleItemIds } from "../items/placement";
import { locationSubtreeIds, visibleLocationIds } from "../locations/visibility";
import { itemsFts } from "./fts";

// --- Search text -----------------------------------------------------------------

export type PreparedText = {
  mode: "all" | "fts" | "prefix";
  /** FTS5 MATCH expression (words >= 3 chars, each a quoted phrase, ANDed). */
  match: string | null;
  /** Words shorter than 3 characters (normalized). */
  short: string[];
};

export function prepareSearchText(q: string | undefined): PreparedText {
  const words = normalizeSearchText(q ?? "")
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return { mode: "all", match: null, short: [] };
  const long = words.filter((w) => [...w].length >= SEARCH_MIN_FTS);
  const short = words.filter((w) => [...w].length < SEARCH_MIN_FTS);
  if (long.length === 0) return { mode: "prefix", match: null, short };
  return { mode: "fts", match: long.map((w) => `"${w.replaceAll('"', '""')}"`).join(" "), short };
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function textCondition(p: PreparedText, joined: boolean): SQL | undefined {
  if (p.mode === "all") return undefined;
  if (p.mode === "prefix") {
    return and(
      ...p.short.map(
        (w) =>
          sql`(${items.nameSort} like ${`${likeEscape(w)}%`} escape '\\' or ${items.nameSort} like ${`% ${likeEscape(w)}%`} escape '\\')`,
      ),
    );
  }
  const match = joined
    ? sql`${itemsFts} match ${p.match}`
    : sql`${items.id} in (select ${itemsFts.itemId} from ${itemsFts} where ${itemsFts} match ${p.match})`;
  return and(match, ...p.short.map((w) => sql`instr(${items.nameSort}, ${w}) > 0`));
}

// --- Filters ---------------------------------------------------------------------

export type Dim =
  | "q"
  | "type"
  | "owner"
  | "mine"
  | "location"
  | "container"
  | "status"
  | "tags"
  | "attributes"
  | "price"
  | "lowStock"
  | "exclude";

type Conditions = Map<Dim, SQL>;

const FALSE = sql`1 = 0`;

function ownedByCtx(ctx: AuthCtx): SQL {
  const gids = [...ctx.groupIds];
  const mine = and(eq(items.ownerKind, "user"), eq(items.ownerId, ctx.userId)) as SQL;
  return gids.length
    ? (or(mine, and(eq(items.ownerKind, "group"), inArray(items.ownerId, gids))) as SQL)
    : mine;
}

/** Active effective fields of a type (for attribute filters and facets); null if unknown. */
function typeFields(db: DbOrTx, typeId: string): EffectiveField[] | null {
  const types = loadTypes(db as AppDb);
  if (!types.some((t) => t.id === typeId)) return null;
  return activeFields(resolveFields(types, typeId));
}

const jsonPath = (key: string, sub = "") => `$."${key}"${sub}`;
const scalar = (v: string | number | boolean) => (typeof v === "boolean" ? (v ? 1 : 0) : v);

function attributeCondition(field: EffectiveField, f: AttributeFilter): SQL | undefined {
  const parts: SQL[] = [];
  const values = (f.values ?? []).map(scalar);
  const multi = field.kind === "multiselect" || isMultiple(field);
  const textual = field.kind === "text" || field.kind === "longtext";
  if (multi) {
    if (values.length) {
      const vals = textual ? values.map((v) => String(v).toLowerCase()) : values;
      const col = textual ? sql`lower(je.value)` : sql`je.value`;
      parts.push(
        sql`exists (select 1 from json_each(${items.attributes}, ${jsonPath(field.key)}) je where ${col} in (${sql.join(
          vals.map((v) => sql`${v}`),
          sql`, `,
        )}))`,
      );
    }
    return parts.length ? and(...parts) : undefined;
  }
  const sub = field.kind === "measure" || field.kind === "size" ? ".value" : "";
  const ex = sql`json_extract(${items.attributes}, ${jsonPath(field.key, sub)})`;
  if (values.length) {
    if (textual) {
      parts.push(
        sql`lower(${ex}) in (${sql.join(
          values.map((v) => sql`${String(v).toLowerCase()}`),
          sql`, `,
        )})`,
      );
    } else if (field.kind === "size") {
      parts.push(
        sql`${ex} in (${sql.join(
          values.map((v) => sql`${String(v)}`),
          sql`, `,
        )})`,
      );
    } else {
      parts.push(
        sql`${ex} in (${sql.join(
          values.map((v) => sql`${v}`),
          sql`, `,
        )})`,
      );
    }
  }
  if (f.min !== undefined) parts.push(sql`${ex} >= ${f.min}`);
  if (f.max !== undefined) parts.push(sql`${ex} <= ${f.max}`);
  return parts.length ? and(...parts) : undefined;
}

export type BuildOptions = {
  /** items_fts is joined (relevance sort): MATCH goes into WHERE directly. */
  joined?: boolean;
  excludeIds?: string[];
};

/** One SQL condition per active filter dimension (visibility not included). */
export function buildConditions(
  db: DbOrTx,
  ctx: AuthCtx,
  f: SearchFilters,
  opts: BuildOptions = {},
): { conds: Conditions; text: PreparedText } {
  const conds: Conditions = new Map();
  const text = prepareSearchText(f.q);
  const t = textCondition(text, !!opts.joined);
  if (t) conds.set("q", t);

  if (f.typeId) {
    const types = loadTypes(db as AppDb);
    const ids = types.some((x) => x.id === f.typeId) ? typeAndDescendantIds(types, f.typeId) : [];
    conds.set("type", ids.length ? inArray(items.typeId, ids) : FALSE);
  }
  if (f.owners?.length) {
    conds.set(
      "owner",
      or(
        ...f.owners.map((o) =>
          o.ownerKind === "household"
            ? eq(items.ownerKind, "household")
            : and(eq(items.ownerKind, o.ownerKind), eq(items.ownerId, o.ownerId ?? "")),
        ),
      ) as SQL,
    );
  }
  if (f.mine) conds.set("mine", ownedByCtx(ctx));
  if (f.locationId) {
    conds.set(
      "location",
      f.locationScope === "direct"
        ? (and(eq(items.locationId, f.locationId), isNull(items.containerItemId)) as SQL)
        : inArray(items.locationId, locationSubtreeIds(db, f.locationId)),
    );
  }
  if (f.containerId) conds.set("container", eq(items.containerItemId, f.containerId));
  if (f.statuses?.length) conds.set("status", inArray(items.status, f.statuses));
  else if (!f.includeGone) conds.set("status", notInArray(items.status, [...GONE_STATUSES]));
  if (f.tagIds?.length) {
    conds.set(
      "tags",
      and(
        ...[...new Set(f.tagIds)].map(
          (tagId) =>
            sql`exists (select 1 from ${itemTags} where ${itemTags.itemId} = ${items.id} and ${itemTags.tagId} = ${tagId})`,
        ),
      ) as SQL,
    );
  }
  if (f.attributes?.length) {
    if (!f.typeId) throw new ItemsError(422, "SEARCH_ATTRIBUTE_NEEDS_TYPE");
    const fields = typeFields(db, f.typeId) ?? [];
    const parts: SQL[] = [];
    for (const af of f.attributes) {
      const field = fields.find((x) => x.key === af.key);
      if (!field) throw new ItemsError(422, "SEARCH_ATTRIBUTE_UNKNOWN", af.key);
      const c = attributeCondition(field, af);
      if (c) parts.push(c);
    }
    if (parts.length) conds.set("attributes", and(...parts) as SQL);
  }
  if (f.priceMin !== undefined || f.priceMax !== undefined) {
    conds.set(
      "price",
      and(
        moneyVisibleWhere(ctx),
        isNotNull(items.priceCents),
        f.priceMin !== undefined ? gte(items.priceCents, f.priceMin) : undefined,
        f.priceMax !== undefined ? lte(items.priceCents, f.priceMax) : undefined,
      ) as SQL,
    );
  }
  if (f.lowStock)
    conds.set(
      "lowStock",
      sql`${items.minQuantity} is not null and ${items.quantity} < ${items.minQuantity}`,
    );
  if (opts.excludeIds?.length) conds.set("exclude", notInArray(items.id, opts.excludeIds));
  return { conds, text };
}

/** visibleItemsWhere(ctx) AND every condition except the omitted dimensions. */
export function whereOf(ctx: AuthCtx, conds: Conditions, omit: readonly Dim[] = []): SQL {
  const parts = [...conds.entries()].filter(([d]) => !omit.includes(d)).map(([, c]) => c);
  return and(visibleItemsWhere(ctx), ...parts) as SQL;
}

// --- Sorting and cursors -------------------------------------------------------------

type SortSpec = { keys: SQL[]; dir: "asc" | "desc" };

function sortSpec(sort: ItemSort, ctx: AuthCtx): SortSpec {
  switch (sort) {
    case "relevance":
      return { keys: [sql`${itemsFts}.rank`, sql`${items.id}`], dir: "asc" };
    case "name_asc":
    case "name_desc":
      return {
        keys: [sql`${items.nameSort}`, sql`${items.id}`],
        dir: sort === "name_asc" ? "asc" : "desc",
      };
    case "updated_asc":
    case "updated_desc":
      return {
        keys: [sql`${items.updatedAt}`, sql`${items.id}`],
        dir: sort === "updated_asc" ? "asc" : "desc",
      };
    case "created_asc":
    case "created_desc":
      return {
        keys: [sql`${items.createdAt}`, sql`${items.id}`],
        dir: sort === "created_asc" ? "asc" : "desc",
      };
    case "price_asc":
    case "price_desc": {
      // Prices the caller may not see sort as "no price" (last), so the order
      // never reveals them (DESIGN §3.4).
      const shown = sql`(${moneyVisibleWhere(ctx)} and ${items.priceCents} is not null)`;
      const flag = sql`(case when ${shown} then 0 else 1 end)`;
      const value =
        sort === "price_asc"
          ? sql`(case when ${shown} then ${items.priceCents} else 0 end)`
          : sql`(case when ${shown} then -${items.priceCents} else 0 end)`;
      return { keys: [flag, value, sql`${items.id}`], dir: "asc" };
    }
  }
}

type Cursor = { s: ItemSort; k: (string | number | null)[] };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string, sort: ItemSort, n: number): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (
      c &&
      c.s === sort &&
      Array.isArray(c.k) &&
      c.k.length === n &&
      c.k.every((v) => typeof v === "string" || typeof v === "number")
    )
      return c;
  } catch {
    // fall through
  }
  throw new ItemsError(422, "CURSOR_INVALID");
}

// --- Rows ----------------------------------------------------------------------------

const listColumns = {
  id: items.id,
  name: items.name,
  shortCode: items.shortCode,
  typeId: items.typeId,
  status: items.status,
  ownerKind: items.ownerKind,
  ownerId: items.ownerId,
  visibility: items.visibility,
  locationId: items.locationId,
  containerItemId: items.containerItemId,
  quantity: items.quantity,
  unit: items.unit,
  minQuantity: items.minQuantity,
  priceCents: items.priceCents,
  currency: items.currency,
  createdAt: items.createdAt,
  updatedAt: items.updatedAt,
  version: items.version,
};

export function householdName(db: DbOrTx): string {
  return (
    db.select({ n: settings.householdName }).from(settings).get()?.n ?? m.items_owner_household()
  );
}

/** Display names for owners (users, groups, the household). */
export function ownerRefs(
  db: DbOrTx,
  owners: readonly { ownerKind: OwnerRef["kind"]; ownerId: string | null }[],
): (o: { ownerKind: OwnerRef["kind"]; ownerId: string | null }) => OwnerRef {
  const userIds = [...new Set(owners.filter((o) => o.ownerKind === "user").map((o) => o.ownerId!))];
  const groupIds = [
    ...new Set(owners.filter((o) => o.ownerKind === "group").map((o) => o.ownerId!)),
  ];
  const un = new Map(
    userIds.length
      ? db
          .select({ id: users.id, n: users.displayName })
          .from(users)
          .where(inArray(users.id, userIds))
          .all()
          .map((r) => [r.id, r.n])
      : [],
  );
  const gn = new Map(
    groupIds.length
      ? db
          .select({ id: groups.id, n: groups.name })
          .from(groups)
          .where(inArray(groups.id, groupIds))
          .all()
          .map((r) => [r.id, r.n])
      : [],
  );
  const hh = owners.some((o) => o.ownerKind === "household") ? householdName(db) : "";
  return (o) => ({
    kind: o.ownerKind,
    id: o.ownerId,
    name:
      o.ownerKind === "household"
        ? hh
        : ((o.ownerKind === "user" ? un.get(o.ownerId!) : gn.get(o.ownerId!)) ??
          m.items_owner_unknown()),
  });
}

/** Tags of the given items, ordered by name. */
export function tagsOfItems(db: DbOrTx, ids: readonly string[]): Map<string, TagRef[]> {
  const out = new Map<string, TagRef[]>();
  if (ids.length === 0) return out;
  const rows = db
    .select({ itemId: itemTags.itemId, id: tags.id, name: tags.name, color: tags.color })
    .from(itemTags)
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(inArray(itemTags.itemId, [...ids]))
    .orderBy(asc(tags.name))
    .all();
  for (const { itemId, ...t } of rows) out.set(itemId, [...(out.get(itemId) ?? []), t]);
  return out;
}

/** Same order as coverPhotos() in attachments/service.ts (not imported: it pulls in sharp). */
function firstPhotos(db: DbOrTx, ids: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = db
    .select({ itemId: attachments.itemId, id: attachments.id })
    .from(attachments)
    .where(and(inArray(attachments.itemId, [...ids]), eq(attachments.kind, "photo")))
    .orderBy(asc(attachments.sort), asc(attachments.createdAt), asc(attachments.id))
    .all();
  for (const r of rows) if (!out.has(r.itemId)) out.set(r.itemId, r.id);
  return out;
}

/** Turns rows (from a query that ANDed visibleItemsWhere) into list rows. */
export function toListRows(
  db: DbOrTx,
  ctx: AuthCtx,
  rows: readonly (ListRowSource & {
    typeName: string;
    typeIcon: string | null;
    locationName: string | null;
  })[],
): ItemListRow[] {
  const ids = rows.map((r) => r.id);
  const owner = ownerRefs(db, rows);
  const tagMap = tagsOfItems(db, ids);
  const photos = firstPhotos(db, ids);
  const containers = visibleItemIds(
    db,
    ctx,
    rows.map((r) => r.containerItemId),
  );
  const extra = new Map(rows.map((r) => [r.id, r]));
  return serializeItemsForCtx(
    db as AppDb,
    ctx,
    rows.map(({ typeName: _t, typeIcon: _i, locationName: _l, ...src }) => src),
  ).map((s) => {
    const r = extra.get(s.id)!;
    return {
      ...s,
      containerItemId:
        s.containerItemId && containers.has(s.containerItemId) ? s.containerItemId : null,
      typeName: r.typeName,
      typeIcon: r.typeIcon,
      owner: owner(r),
      locationName: r.locationName,
      gone: isGoneStatus(r.status),
      lowStock: r.minQuantity !== null && r.quantity < r.minQuantity,
      tags: tagMap.get(s.id) ?? [],
      photoId: photos.get(s.id) ?? null,
    };
  });
}

// --- searchItems -----------------------------------------------------------------------

/**
 * The list query: filters, search text, sort, keyset pagination. Returns only
 * items visible to ctx, serialized for ctx's level.
 */
export function searchItems(
  db: DbOrTx,
  ctx: AuthCtx,
  raw: SearchItemsInput,
  opts: { excludeIds?: string[] } = {},
): ItemPage {
  const input = parseInput(searchItemsInput, raw);
  const limit = input.limit ?? SEARCH_PAGE_DEFAULT;
  const probe = prepareSearchText(input.q);
  let sort: ItemSort = input.sort ?? (probe.mode === "fts" ? "relevance" : "name_asc");
  if (sort === "relevance" && probe.mode !== "fts") sort = "name_asc";
  const joined = sort === "relevance";

  const { conds, text } = buildConditions(db, ctx, input, { joined, excludeIds: opts.excludeIds });
  const spec = sortSpec(sort, ctx);
  const where = [whereOf(ctx, conds)];
  if (input.cursor) {
    const c = decodeCursor(input.cursor, sort, spec.keys.length);
    const lhs = sql.join(spec.keys, sql`, `);
    const rhs = sql.join(
      c.k.map((v) => sql`${v}`),
      sql`, `,
    );
    where.push(spec.dir === "asc" ? sql`(${lhs}) > (${rhs})` : sql`(${lhs}) < (${rhs})`);
  }
  const keyCols = Object.fromEntries(
    spec.keys.map((k, i) => [`k${i}`, sql<string | number | null>`${k}`]),
  );

  let query = db
    .select({
      ...listColumns,
      typeName: itemTypes.name,
      typeIcon: itemTypes.icon,
      locationName: locations.name,
      ...keyCols,
    })
    .from(items)
    .$dynamic();
  if (joined) query = query.innerJoin(itemsFts, eq(itemsFts.itemId, items.id));
  const rows = query
    .innerJoin(itemTypes, eq(itemTypes.id, items.typeId))
    .leftJoin(locations, eq(locations.id, items.locationId))
    .where(and(...where))
    .orderBy(...spec.keys.map((k) => (spec.dir === "asc" ? asc(k) : desc(k))))
    .limit(limit + 1)
    .all() as unknown as (ListRowSource & {
    typeName: string;
    typeIcon: string | null;
    locationName: string | null;
    [k: `k${number}`]: string | number | null;
  })[];

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({ s: sort, k: spec.keys.map((_, i) => last[`k${i}`] ?? null) })
      : null;

  // The total uses the IN-subquery form of the text condition (same set).
  const totalConds = joined ? buildConditions(db, ctx, input, opts).conds : conds;
  const total = db.select({ n: count() }).from(items).where(whereOf(ctx, totalConds)).get()?.n ?? 0;

  const clean = page.map((r) => {
    const out = { ...r } as Record<string, unknown>;
    for (let i = 0; i < spec.keys.length; i++) delete out[`k${i}`];
    return out as unknown as (typeof page)[number];
  });
  return { items: toListRows(db, ctx, clean), nextCursor, total, sort, mode: text.mode };
}

/** Item picker (item reference fields): up to 20 visible items, gone ones excluded. */
export function pickItems(
  db: DbOrTx,
  ctx: AuthCtx,
  input: { q: string; excludeId?: string },
): PickedItem[] {
  if (normalizeSearchText(input.q).length < 2) return [];
  const page = searchItems(
    db,
    ctx,
    { q: input.q, limit: 20 },
    { excludeIds: input.excludeId ? [input.excludeId] : [] },
  );
  return page.items.map((r) => ({
    id: r.id,
    name: r.name,
    shortCode: r.shortCode,
    typeName: r.typeName,
  }));
}

// --- Facets ------------------------------------------------------------------------------

const VALUE_KINDS = new Set(["select", "multiselect", "boolean", "size", "user", "color"]);
const RANGE_KINDS = new Set(["integer", "decimal", "measure", "date"]);

/**
 * What the filter controls need, with counts. Each dimension is counted over
 * the current filters except its own (so picking a type still shows the
 * other types' counts). Counts only include visible items.
 */
export function searchFacets(db: DbOrTx, ctx: AuthCtx, raw: SearchFilters): SearchFacets {
  const input = parseInput(searchFiltersInput, raw);
  const { conds } = buildConditions(db, ctx, input);

  // Types
  const typeCounts = new Map(
    db
      .select({ id: items.typeId, n: count() })
      .from(items)
      .where(whereOf(ctx, conds, ["type", "attributes"]))
      .groupBy(items.typeId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  const allTypes = loadTypes(db as AppDb).filter((t) => !t.archivedAt || typeCounts.has(t.id));
  const types = allTypes.map((t) => ({
    id: t.id,
    parentId: t.parentId,
    name: t.name,
    icon: t.icon,
    count: typeCounts.get(t.id) ?? 0,
    total: typeAndDescendantIds(allTypes, t.id).reduce((s, id) => s + (typeCounts.get(id) ?? 0), 0),
  }));

  // Owners
  const ownerRows = db
    .select({ ownerKind: items.ownerKind, ownerId: items.ownerId, n: count() })
    .from(items)
    .where(whereOf(ctx, conds, ["owner", "mine"]))
    .groupBy(items.ownerKind, items.ownerId)
    .all();
  const ref = ownerRefs(db, [...ownerRows, { ownerKind: "household", ownerId: null }]);
  const owners = ownerRows.map((o) => ({ ...ref(o), count: o.n }));
  if (!owners.some((o) => o.kind === "household"))
    owners.push({ ...ref({ ownerKind: "household", ownerId: null }), count: 0 });
  owners.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de"));

  // Locations
  const locCounts = new Map(
    db
      .select({ id: items.locationId, n: count() })
      .from(items)
      .where(and(whereOf(ctx, conds, ["location"]), isNotNull(items.locationId)))
      .groupBy(items.locationId)
      .all()
      .map((r) => [r.id!, r.n]),
  );
  const visibleLocs = visibleLocationIds(db, ctx);
  const locRows = db
    .select({ id: locations.id, parentId: locations.parentId, name: locations.name })
    .from(locations)
    .orderBy(asc(locations.name))
    .all()
    .filter((l) => visibleLocs === null || visibleLocs.has(l.id));
  const children = new Map<string | null, string[]>();
  for (const l of locRows) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.id]);
  const totalOf = (id: string, depth = 0): number =>
    (locCounts.get(id) ?? 0) +
    (depth > 100 ? 0 : (children.get(id) ?? []).reduce((s, c) => s + totalOf(c, depth + 1), 0));
  const locs = locRows.map((l) => ({
    ...l,
    count: locCounts.get(l.id) ?? 0,
    total: totalOf(l.id),
  }));

  // Tags
  const tagRows = db
    .select({ id: tags.id, name: tags.name, color: tags.color, n: count() })
    .from(itemTags)
    .innerJoin(items, eq(items.id, itemTags.itemId))
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(whereOf(ctx, conds, ["tags"]))
    .groupBy(tags.id)
    .orderBy(asc(tags.name))
    .all();
  const tagFacets = tagRows.map(({ n, ...t }) => ({ ...t, count: n }));

  // Statuses (gone ones included: the status facet is how you get to them)
  const statusCounts = new Map(
    db
      .select({ s: items.status, n: count() })
      .from(items)
      .where(whereOf(ctx, conds, ["status"]))
      .groupBy(items.status)
      .all()
      .map((r) => [r.s, r.n]),
  );
  const statuses = ITEM_STATUSES.map((s) => ({
    status: s,
    gone: isGoneStatus(s),
    count: statusCounts.get(s) ?? 0,
  }));

  // Attributes of the chosen type
  let attributeFacets: AttributeFacet[] | null = null;
  if (input.typeId) {
    const fields = typeFields(db, input.typeId) ?? [];
    const where = whereOf(ctx, conds, ["attributes"]);
    attributeFacets = [];
    for (const field of fields) {
      if (VALUE_KINDS.has(field.kind)) attributeFacets.push(valueFacet(db, field, where));
      else if (RANGE_KINDS.has(field.kind)) attributeFacets.push(rangeFacet(db, field, where));
    }
  }

  const priceAvailable =
    ctx.role !== "guest" &&
    !!db
      .select({ id: items.id })
      .from(items)
      .where(
        and(whereOf(ctx, conds, ["price"]), moneyVisibleWhere(ctx), isNotNull(items.priceCents)),
      )
      .limit(1)
      .get();

  return {
    types,
    owners,
    locations: locs,
    tags: tagFacets,
    statuses,
    attributes: attributeFacets,
    priceAvailable,
  };
}

function valueFacet(db: DbOrTx, field: EffectiveField, where: SQL): AttributeFacet {
  const multi = field.kind === "multiselect" || isMultiple(field);
  const sub = field.kind === "size" ? ".value" : "";
  const rows = multi
    ? db.all<{ v: string | number; n: number }>(sql`
        select je.value as v, count(*) as n from ${items}, json_each(${items.attributes}, ${jsonPath(field.key)}) je
        where ${where} group by je.value order by n desc limit 50`)
    : db.all<{ v: string | number; n: number }>(sql`
        select json_extract(${items.attributes}, ${jsonPath(field.key, sub)}) as v, count(*) as n from ${items}
        where ${where} and json_extract(${items.attributes}, ${jsonPath(field.key, sub)}) is not null
        group by v order by n desc limit 50`);
  let userNames = new Map<string, string>();
  if (field.kind === "user") {
    const ids = rows.map((r) => String(r.v));
    userNames = new Map(
      ids.length
        ? db
            .select({ id: users.id, n: users.displayName })
            .from(users)
            .where(inArray(users.id, ids))
            .all()
            .map((u) => [u.id, u.n])
        : [],
    );
  }
  const values = rows.map((r) => {
    let value: string | number | boolean = r.v;
    let label = String(r.v);
    if (field.kind === "boolean") {
      value = r.v === 1;
      label = value ? m.field_yes() : m.field_no();
    } else if (field.kind === "size") label = formatSizeValue(String(r.v));
    else if (field.kind === "user") label = userNames.get(String(r.v)) ?? m.field_unknown_user();
    return { value, label, count: r.n };
  });
  if (field.kind === "select" || field.kind === "multiselect")
    values.sort(
      (a, b) => field.options.indexOf(String(a.value)) - field.options.indexOf(String(b.value)),
    );
  return {
    key: field.key,
    label: field.label,
    kind: field.kind,
    ...("unit" in field && field.unit ? { unit: field.unit } : {}),
    values,
  };
}

function rangeFacet(db: DbOrTx, field: EffectiveField, where: SQL): AttributeFacet {
  const sub = field.kind === "measure" ? ".value" : "";
  const ex = sql`json_extract(${items.attributes}, ${jsonPath(field.key, sub)})`;
  const row = db.all<{ lo: number | string | null; hi: number | string | null }>(sql`
    select min(${ex}) as lo, max(${ex}) as hi from ${items} where ${where} and ${ex} is not null`)[0];
  return {
    key: field.key,
    label: field.label,
    kind: field.kind,
    ...("unit" in field && field.unit ? { unit: field.unit } : {}),
    range: { min: row?.lo ?? null, max: row?.hi ?? null },
  };
}
