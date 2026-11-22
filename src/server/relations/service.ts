// Item relations (DESIGN §4.5): "fits" (vacuum bag → vacuum), "accessory_of", "part_of" (kit), "replaces".
//
//   see     a relation shows on an item's page only when the caller can see the other item too (SQL join with visibleItemsWhere).
//   add     both items visible (an invisible one answers ITEM_NOT_FOUND), and edit on at least one of them: a relation says something about both, so the owner of the vacuum may record which bags fit it.
//   remove  the same rule.
// Not allowed: an item related to itself, the same relation twice, and loops of "accessory_of", "part_of" or "replaces" (A part of B part of A); "fits" may go both ways.
// Relations carry no item version: adding one never conflicts with an edit of either item.
// Each change is an event on both items (item.relation_added / item.relation_removed, diff { relation, direction, relatedItemId }); the history drops it for a reader who cannot see the other item.
import { and, asc, eq, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { isGoneStatus } from "../../lib/items/constants";
import {
  type ItemRelationKind,
  type ItemRelations,
  RELATION_ROLES,
  RELATIONS_PER_ITEM_MAX,
  type RelationDirection,
  type RelationInput,
  type RelationRow,
  relationInput,
} from "../../lib/relations/types";
import { atLeast, itemLevels, type Level, visibleItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import { itemRelations, items, itemTypes } from "../db/schema";
import { recordItemEvent } from "../history/record";
import { requireItem } from "../items/access";
import { forbidden, ItemsError, parseInput } from "../items/errors";

/** Kinds that must not loop back to where they started. */
const ACYCLIC: ReadonlySet<ItemRelationKind> = new Set(["accessory_of", "part_of", "replaces"]);
const MAX_DEPTH = 100;

const roleOrder = new Map(RELATION_ROLES.map((r, i) => [`${r.kind}:${r.direction}`, i]));

/** The relations of an item the caller can see, from that item's side. */
export function listItemRelations(db: AppDb, ctx: AuthCtx, itemId: string): ItemRelations {
  const { item, level } = requireItem(db, ctx, itemId, "view");
  const other = alias(items, "other");
  const otherType = alias(itemTypes, "other_type");
  const select = {
    kind: itemRelations.kind,
    fromItemId: itemRelations.fromItemId,
    other: {
      id: other.id,
      name: other.name,
      nameSort: other.nameSort,
      shortCode: other.shortCode,
      status: other.status,
      quantity: other.quantity,
      unit: other.unit,
      minQuantity: other.minQuantity,
      ownerKind: other.ownerKind,
      ownerId: other.ownerId,
      visibility: other.visibility,
      typeName: otherType.name,
      typeIcon: otherType.icon,
      tracking: otherType.tracking,
    },
  };
  const rows = db
    .select(select)
    .from(itemRelations)
    .innerJoin(
      other,
      or(
        and(eq(itemRelations.fromItemId, item.id), eq(other.id, itemRelations.toItemId)),
        and(eq(itemRelations.toItemId, item.id), eq(other.id, itemRelations.fromItemId)),
      ),
    )
    .innerJoin(otherType, eq(otherType.id, other.typeId))
    .where(
      and(
        or(eq(itemRelations.fromItemId, item.id), eq(itemRelations.toItemId, item.id)),
        visibleItemsWhere(ctx, other),
      ),
    )
    .orderBy(asc(other.nameSort), asc(other.id))
    .all();
  const levels = itemLevels(
    db,
    ctx,
    rows.map((r) => r.other),
  );
  const canEditHere = atLeast(level, "edit");
  const relations: RelationRow[] = rows.map((r) => {
    const o = r.other;
    const direction: RelationDirection = r.fromItemId === item.id ? "out" : "in";
    return {
      kind: r.kind,
      direction,
      canRemove: canEditHere || atLeast(levels.get(o.id) ?? "none", "edit"),
      other: {
        id: o.id,
        name: o.name,
        shortCode: o.shortCode,
        typeName: o.typeName,
        typeIcon: o.typeIcon,
        tracking: o.tracking,
        status: o.status,
        gone: isGoneStatus(o.status),
        quantity: o.quantity,
        unit: o.unit,
        minQuantity: o.minQuantity,
        lowStock: o.minQuantity !== null && o.quantity < o.minQuantity,
      },
    };
  });
  // Stable by role; within a role the SQL order (name) stays.
  relations.sort(
    (a, b) =>
      (roleOrder.get(`${a.kind}:${a.direction}`) ?? 0) -
      (roleOrder.get(`${b.kind}:${b.direction}`) ?? 0),
  );
  return { relations, canAdd: canEditHere };
}

/** Both items visible (else ITEM_NOT_FOUND), edit on at least one (else ITEM_FORBIDDEN). */
function requireRelationAccess(db: DbOrTx, ctx: AuthCtx, input: RelationInput) {
  if (input.fromItemId === input.toItemId) throw new ItemsError(422, "RELATION_SELF");
  const from = requireItem(db, ctx, input.fromItemId, "view");
  const to = requireItem(db, ctx, input.toItemId, "view");
  const editable = (l: Level) => atLeast(l, "edit");
  if (!editable(from.level) && !editable(to.level)) throw forbidden();
  return { from: from.item, to: to.item };
}

/** True when `to` already reaches `from` through relations of `kind` (adding from → to would close a loop). */
function wouldLoop(db: DbOrTx, kind: ItemRelationKind, fromId: string, toId: string): boolean {
  const r = db.get<{ found: number } | undefined>(sql`
    with recursive up(id, depth) as (
      select ${toId}, 0
      union
      select r.to_item_id, up.depth + 1 from ${itemRelations} r join up on r.from_item_id = up.id
        where r.kind = ${kind} and up.depth < ${MAX_DEPTH}
    )
    select 1 as found from up where id = ${fromId} limit 1`);
  return !!r;
}

function relationCount(db: DbOrTx, itemId: string): number {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(itemRelations)
      .where(or(eq(itemRelations.fromItemId, itemId), eq(itemRelations.toItemId, itemId)))
      .get()?.n ?? 0
  );
}

function recordBoth(
  db: DbOrTx,
  ctx: AuthCtx | null,
  action: "item.relation_added" | "item.relation_removed",
  r: RelationInput,
  extra: Record<string, unknown> = {},
) {
  const actorId = ctx?.userId ?? null;
  recordItemEvent(db, {
    actorId,
    action,
    itemId: r.fromItemId,
    diff: { relation: r.kind, direction: "out", relatedItemId: r.toItemId, ...extra },
  });
  recordItemEvent(db, {
    actorId,
    action,
    itemId: r.toItemId,
    diff: { relation: r.kind, direction: "in", relatedItemId: r.fromItemId, ...extra },
  });
}

/**
 * Inserts a relation and its two events without permission checks (the caller has done them, or it is a system migration).
 * Returns false when the relation already existed.
 */
export function insertRelation(
  db: DbOrTx,
  ctx: AuthCtx | null,
  r: RelationInput,
  extra: Record<string, unknown> = {},
): boolean {
  const done = db
    .insert(itemRelations)
    .values({ ...r, createdBy: ctx?.userId ?? null })
    .onConflictDoNothing()
    .returning({ kind: itemRelations.kind })
    .get();
  if (!done) return false;
  recordBoth(db, ctx, "item.relation_added", r, extra);
  return true;
}

export function addItemRelation(db: AppDb, ctx: AuthCtx, raw: RelationInput): void {
  const input = parseInput(relationInput, raw);
  db.transaction((tx) => {
    requireRelationAccess(tx, ctx, input);
    if (ACYCLIC.has(input.kind) && wouldLoop(tx, input.kind, input.fromItemId, input.toItemId))
      throw new ItemsError(409, "RELATION_CYCLE");
    for (const id of [input.fromItemId, input.toItemId])
      if (relationCount(tx, id) >= RELATIONS_PER_ITEM_MAX)
        throw new ItemsError(422, "RELATION_LIMIT", String(RELATIONS_PER_ITEM_MAX));
    if (!insertRelation(tx, ctx, input)) throw new ItemsError(409, "RELATION_EXISTS");
  });
}

export function removeItemRelation(db: AppDb, ctx: AuthCtx, raw: RelationInput): void {
  const input = parseInput(relationInput, raw);
  db.transaction((tx) => {
    requireRelationAccess(tx, ctx, input);
    const match: SQL = and(
      eq(itemRelations.fromItemId, input.fromItemId),
      eq(itemRelations.toItemId, input.toItemId),
      eq(itemRelations.kind, input.kind),
    ) as SQL;
    const gone = tx.delete(itemRelations).where(match).returning().get();
    if (!gone) throw new ItemsError(404, "RELATION_NOT_FOUND");
    recordBoth(tx, ctx, "item.relation_removed", input);
  });
}
