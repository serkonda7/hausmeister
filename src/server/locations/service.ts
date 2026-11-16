// Locations (DESIGN §4.5): a tree of places with short codes.
//
// Rights:
//  - read: admins and members see the whole tree; guests only the locations
//    on the path of an item they can see (./visibility.ts). Item counts only
//    count items visible to the caller.
//  - create, rename, move, change kind/notes: admins and members (§3.5:
//    "create locations"; locations are shared household structure, so any
//    member may tidy them up). Guests never.
//  - delete: a member only an empty location (no sub-locations, no items at
//    all, including ones they cannot see; the error says only "not empty").
//    An admin any location: its sub-locations and items move up to the parent
//    (or to "no location" at the top), each moved item gets an item.moved event.
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { buildTree } from "../../lib/item-types/tree";
import type { LocationKind } from "../../lib/items/constants";
import {
  type CreateLocationInput,
  createLocationInput,
  idSchema,
  moveLocationInput,
  type UpdateLocationInput,
  updateLocationInput,
} from "../../lib/items/inputs";
import type { LocationDetail, LocationNode, LocationSummary } from "../../lib/items/types";
import { can, visibleItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import { items, locations } from "../db/schema";
import { recordCatalogEvent, recordItemEvent } from "../history/record";
import { uniqueShortCode, writeVersioned } from "../items/access";
import { ItemsError, parseInput } from "../items/errors";
import {
  canSeeLocation,
  locationChain,
  locationSubtreeIds,
  visibleLocationIds,
} from "./visibility";

const notFound = () => new ItemsError(404, "LOCATION_NOT_FOUND");

function assertCanWrite(ctx: AuthCtx) {
  if (!can(ctx, "locations.create")) throw new ItemsError(403, "LOCATION_FORBIDDEN");
}

function summaries(db: DbOrTx, ctx: AuthCtx): LocationSummary[] {
  const visible = visibleLocationIds(db, ctx);
  const rows = db
    .select()
    .from(locations)
    .all()
    .filter((l) => canSeeLocation(visible, l.id));
  const counts = new Map(
    db
      .select({ id: items.locationId, n: count() })
      .from(items)
      .where(and(visibleItemsWhere(ctx), sql`${items.locationId} is not null`))
      .groupBy(items.locationId)
      .all()
      .map((r) => [r.id!, r.n]),
  );
  const children = new Map<string | null, string[]>();
  for (const l of rows) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.id]);
  const total = (id: string, depth = 0): number =>
    (counts.get(id) ?? 0) +
    (depth > 100 ? 0 : (children.get(id) ?? []).reduce((s, c) => s + total(c, depth + 1), 0));
  return rows.map((l) => ({
    id: l.id,
    parentId: l.parentId,
    name: l.name,
    kind: (l.kind as LocationKind | null) ?? null,
    shortCode: l.shortCode,
    notes: l.notes,
    itemCount: counts.get(l.id) ?? 0,
    totalCount: total(l.id),
  }));
}

/** The location tree the caller may see, siblings sorted by name. */
export function listLocations(db: AppDb, ctx: AuthCtx): LocationNode[] {
  const list = summaries(db, ctx);
  // A guest's subtree may start below the root: its parent is then invisible.
  const ids = new Set(list.map((l) => l.id));
  return buildTree(
    list.map((l) => (l.parentId && !ids.has(l.parentId) ? { ...l, parentId: null } : l)),
  );
}

export function getLocation(db: AppDb, ctx: AuthCtx, id: string): LocationDetail {
  const list = summaries(db, ctx);
  const loc = list.find((l) => l.id === id);
  if (!loc) throw notFound();
  const path = locationChain(db, id).slice(0, -1);
  const empty = loc.itemCount === 0 && !list.some((l) => l.parentId === id) && isTrulyEmpty(db, id);
  return {
    ...loc,
    path,
    children: list
      .filter((l) => l.parentId === id)
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
    canEdit: can(ctx, "locations.create"),
    canDelete: ctx.role === "admin" || (can(ctx, "locations.create") && empty),
  };
}

/** No sub-locations and no items at all (visibility ignored). */
function isTrulyEmpty(db: DbOrTx, id: string): boolean {
  const child = db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.parentId, id))
    .get();
  if (child) return false;
  return !db.select({ id: items.id }).from(items).where(eq(items.locationId, id)).get();
}

function assertParent(db: DbOrTx, parentId: string | null) {
  if (!parentId) return;
  const p = db.select({ id: locations.id }).from(locations).where(eq(locations.id, parentId)).get();
  if (!p) throw notFound();
}

function assertNameFree(db: DbOrTx, parentId: string | null, name: string, selfId?: string) {
  const siblings = db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(parentId ? eq(locations.parentId, parentId) : isNull(locations.parentId))
    .all();
  const key = name.toLocaleLowerCase("de");
  if (siblings.some((s) => s.id !== selfId && s.name.toLocaleLowerCase("de") === key))
    throw new ItemsError(409, "LOCATION_NAME_TAKEN");
}

export function createLocation(
  db: AppDb,
  ctx: AuthCtx,
  raw: CreateLocationInput,
): { id: string; shortCode: string } {
  assertCanWrite(ctx);
  const input = parseInput(createLocationInput, raw);
  return db.transaction((tx) => {
    const parentId = input.parentId ?? null;
    assertParent(tx, parentId);
    assertNameFree(tx, parentId, input.name);
    const shortCode = uniqueShortCode(tx);
    const row = tx
      .insert(locations)
      .values({
        name: input.name,
        parentId,
        kind: input.kind ?? null,
        notes: input.notes ?? null,
        shortCode,
      })
      .returning({ id: locations.id })
      .get();
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "location.created",
      diff: { locationId: row.id, name: input.name, parentId, kind: input.kind ?? null },
    });
    return { id: row.id, shortCode };
  });
}

function requireLocation(db: DbOrTx, id: string) {
  const l = db.select().from(locations).where(eq(locations.id, id)).get();
  if (!l) throw notFound();
  return l;
}

/** Rename, change kind or notes. */
export function updateLocation(db: AppDb, ctx: AuthCtx, raw: UpdateLocationInput) {
  assertCanWrite(ctx);
  const input = parseInput(updateLocationInput, raw);
  db.transaction((tx) => {
    const l = requireLocation(tx, input.id);
    const next = {
      name: input.name ?? l.name,
      kind: input.kind === undefined ? l.kind : input.kind,
      notes: input.notes === undefined ? l.notes : input.notes,
    };
    if (next.name !== l.name) assertNameFree(tx, l.parentId, next.name, l.id);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of ["name", "kind", "notes"] as const)
      if (next[k] !== l[k]) changes[k] = { from: l[k], to: next[k] };
    if (Object.keys(changes).length === 0) return;
    tx.update(locations).set(next).where(eq(locations.id, l.id)).run();
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "location.updated",
      diff: { locationId: l.id, ...changes },
    });
  });
}

/** Moves a location under another one (null = top level); no cycles. */
export function moveLocation(
  db: AppDb,
  ctx: AuthCtx,
  raw: { id: string; parentId: string | null },
) {
  assertCanWrite(ctx);
  const input = parseInput(moveLocationInput, raw);
  db.transaction((tx) => {
    const l = requireLocation(tx, input.id);
    if (l.parentId === input.parentId) return;
    assertParent(tx, input.parentId);
    if (input.parentId && locationSubtreeIds(tx, l.id).includes(input.parentId))
      throw new ItemsError(409, "LOCATION_CYCLE");
    assertNameFree(tx, input.parentId, l.name, l.id);
    tx.update(locations).set({ parentId: input.parentId }).where(eq(locations.id, l.id)).run();
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "location.moved",
      diff: { locationId: l.id, parentId: { from: l.parentId, to: input.parentId } },
    });
  });
}

export function deleteLocation(
  db: AppDb,
  ctx: AuthCtx,
  raw: { id: string },
): { movedItems: number; movedLocations: number } {
  assertCanWrite(ctx);
  const id = parseInput(idSchema, raw?.id);
  return db.transaction((tx) => {
    const l = requireLocation(tx, id);
    if (ctx.role !== "admin" && !isTrulyEmpty(tx, l.id))
      throw new ItemsError(409, "LOCATION_NOT_EMPTY");
    const childIds = tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.parentId, l.id))
      .all()
      .map((r) => r.id);
    if (childIds.length)
      tx.update(locations)
        .set({ parentId: l.parentId })
        .where(inArray(locations.id, childIds))
        .run();
    const inside = tx
      .select({ id: items.id, version: items.version })
      .from(items)
      .where(eq(items.locationId, l.id))
      .all();
    for (const it of inside) {
      writeVersioned(tx, it.id, it.version, { locationId: l.parentId });
      recordItemEvent(tx, {
        actorId: ctx.userId,
        action: "item.moved",
        itemId: it.id,
        diff: { locationId: { from: l.id, to: l.parentId }, reason: "location_deleted" },
      });
    }
    tx.delete(locations).where(eq(locations.id, l.id)).run();
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "location.deleted",
      diff: { locationId: l.id, name: l.name, parentId: l.parentId, shortCode: l.shortCode },
    });
    return { movedItems: inside.length, movedLocations: childIds.length };
  });
}
