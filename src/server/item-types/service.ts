// Item-type logic, independent of the request (testable with createTestDb()).
// Server functions in ./functions.ts wrap these with authMiddleware.
//
// Permissions (DESIGN §3.5):
//  - read: every signed-in user, guests included (they display shared items)
//  - create: admin, member
//  - update / archive / delete: admin always; a member only for a type they
//    created and only while no "other user's items" use it. An item of the type
//    or any subtype counts as another user's unless it was created by the member
//    AND is owned by the member or the household. Group-owned items and items
//    whose creator was deleted (created_by NULL) count as other users' items.
//  - guests change nothing.

import { and, asc, count, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { z } from "zod";
import { diffFields } from "../../lib/diff";
import {
  type FieldDefinition,
  parseStoredFields,
  prepareAttributes,
} from "../../lib/item-types/fields";
import {
  type MigrationPlan,
  planAttributes,
  planNeedsConfirmation,
} from "../../lib/item-types/migrate";
import {
  ancestorIds,
  buildTree,
  type EffectiveField,
  resolveFields,
  type TreeNode,
  typeAndDescendantIds,
  validateTypeTree,
  wouldCreateCycle,
} from "../../lib/item-types/tree";
import {
  type CreateItemTypeInput,
  createItemTypeInput,
  type TrackingMode,
  type UpdateItemTypeInput,
  updateItemTypeInput,
} from "../../lib/item-types/type-input";
import { m } from "../../paraglide/messages";
import { HttpError } from "../auth/context";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { events, items, itemTypes, users } from "../db/schema";

export type ItemTypeErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NOT_CREATOR"
  | "IN_USE_BY_OTHERS"
  | "HAS_ITEMS"
  | "HAS_CHILDREN"
  | "KEY_TAKEN"
  | "KEY_COLLISION"
  | "CYCLE"
  | "PARENT_NOT_FOUND"
  | "INVALID";

/**
 * Errors carry a code as the message ("KEY_COLLISION:voltage" with a detail),
 * which survives server-function serialization; the UI maps it to German text.
 */
export class ItemTypeError extends HttpError {
  constructor(
    status: 403 | 404 | 409 | 422,
    public readonly code: ItemTypeErrorCode,
    public readonly detail?: string,
  ) {
    super(status, detail ? `${code}:${detail}` : code);
    this.name = "ItemTypeError";
  }
}

export type TypeRecord = {
  id: string;
  parentId: string | null;
  key: string;
  name: string;
  icon: string | null;
  tracking: TrackingMode;
  fields: FieldDefinition[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
};

export function loadTypes(db: AppDb): TypeRecord[] {
  return db
    .select()
    .from(itemTypes)
    .orderBy(asc(itemTypes.name))
    .all()
    .map((r) => ({ ...r, fields: parseStoredFields(r.fields) }));
}

function findType(types: TypeRecord[], id: string): TypeRecord {
  const t = types.find((x) => x.id === id);
  if (!t) throw new ItemTypeError(404, "NOT_FOUND");
  return t;
}

/** Effective (inherited + own) fields of a type; hidden fields included. */
export function effectiveFieldsForType(db: AppDb, typeId: string): EffectiveField[] {
  const types = loadTypes(db);
  findType(types, typeId);
  return resolveFields(types, typeId);
}

/** The type's id plus all descendant ids, for "type = Tool" item filters. */
export function typeIdsWithDescendants(db: AppDb, typeId: string): string[] {
  return typeAndDescendantIds(loadTypes(db), typeId);
}

// --- Permissions -------------------------------------------------------------------

/** Items that block a member's schema change: not created by them, or owned by someone else. */
const blockingItemsFor = (userId: string) =>
  or(
    isNull(items.createdBy),
    ne(items.createdBy, userId),
    eq(items.ownerKind, "group"),
    and(eq(items.ownerKind, "user"), ne(items.ownerId, userId)),
  );

function countBlockingItems(db: AppDb, typeIds: string[], userId: string): number {
  if (typeIds.length === 0) return 0;
  const row = db
    .select({ n: count() })
    .from(items)
    .where(and(inArray(items.typeId, typeIds), blockingItemsFor(userId)))
    .get();
  return row?.n ?? 0;
}

export type EditBlock = "guest" | "not_creator" | "in_use_by_others";

function editBlock(db: AppDb, ctx: AuthCtx, types: TypeRecord[], t: TypeRecord): EditBlock | null {
  if (ctx.role === "admin") return null;
  if (ctx.role !== "member") return "guest";
  if (t.createdBy !== ctx.userId) return "not_creator";
  const ids = typeAndDescendantIds(types, t.id);
  return countBlockingItems(db, ids, ctx.userId) > 0 ? "in_use_by_others" : null;
}

function assertCanEdit(db: AppDb, ctx: AuthCtx, types: TypeRecord[], t: TypeRecord) {
  const block = editBlock(db, ctx, types, t);
  if (block === "guest") throw new ItemTypeError(403, "FORBIDDEN");
  if (block === "not_creator") throw new ItemTypeError(403, "NOT_CREATOR");
  if (block === "in_use_by_others") throw new ItemTypeError(403, "IN_USE_BY_OTHERS");
}

function assertCanCreate(ctx: AuthCtx) {
  if (ctx.role !== "admin" && ctx.role !== "member") throw new ItemTypeError(403, "FORBIDDEN");
}

// --- Reads -------------------------------------------------------------------------

export type ItemTypeSummary = {
  id: string;
  parentId: string | null;
  key: string;
  name: string;
  icon: string | null;
  tracking: TrackingMode;
  archivedAt: Date | null;
  createdBy: string | null;
  /** Own active fields. */
  fieldCount: number;
  /** Items of exactly this type; only for admins (null otherwise). */
  itemCount: number | null;
  canEdit: boolean;
};

function directItemCounts(db: AppDb): Map<string, number> {
  const rows = db
    .select({ typeId: items.typeId, n: count() })
    .from(items)
    .groupBy(items.typeId)
    .all();
  return new Map(rows.map((r) => [r.typeId, r.n]));
}

function blockingCountsByType(db: AppDb, userId: string): Map<string, number> {
  const rows = db
    .select({ typeId: items.typeId, n: count() })
    .from(items)
    .where(blockingItemsFor(userId))
    .groupBy(items.typeId)
    .all();
  return new Map(rows.map((r) => [r.typeId, r.n]));
}

function summaries(db: AppDb, ctx: AuthCtx, types: TypeRecord[]): ItemTypeSummary[] {
  const counts = ctx.role === "admin" ? directItemCounts(db) : null;
  const blocking = ctx.role === "member" ? blockingCountsByType(db, ctx.userId) : null;
  return types.map((t) => {
    let canEdit = ctx.role === "admin";
    if (blocking && t.createdBy === ctx.userId)
      canEdit = typeAndDescendantIds(types, t.id).every((id) => !blocking.get(id));
    return {
      id: t.id,
      parentId: t.parentId,
      key: t.key,
      name: t.name,
      icon: t.icon,
      tracking: t.tracking,
      archivedAt: t.archivedAt,
      createdBy: t.createdBy,
      fieldCount: t.fields.filter((f) => !f.hidden).length,
      itemCount: counts ? (counts.get(t.id) ?? 0) : null,
      canEdit,
    };
  });
}

/** All types as a tree (archived ones included unless `includeArchived` is false). */
export function listItemTypes(
  db: AppDb,
  ctx: AuthCtx,
  opts: { includeArchived?: boolean } = {},
): TreeNode<ItemTypeSummary>[] {
  let list = summaries(db, ctx, loadTypes(db));
  if (opts.includeArchived === false) list = list.filter((t) => !t.archivedAt);
  return buildTree(list);
}

export type ItemTypeDetail = ItemTypeSummary & {
  /** The type's own fields (hidden ones included), in order. */
  fields: FieldDefinition[];
  /** Inherited + own fields (hidden ones included). Use activeFields() for forms. */
  effectiveFields: EffectiveField[];
  ancestors: { id: string; name: string }[];
  childIds: string[];
  editBlock: EditBlock | null;
  createdAt: Date;
  updatedAt: Date;
};

export function getItemType(db: AppDb, ctx: AuthCtx, id: string): ItemTypeDetail {
  const types = loadTypes(db);
  const t = findType(types, id);
  const summary = summaries(db, ctx, [t])[0]!;
  const block = editBlock(db, ctx, types, t);
  return {
    ...summary,
    canEdit: block === null,
    editBlock: block,
    fields: t.fields,
    effectiveFields: resolveFields(types, id),
    ancestors: ancestorIds(types, id).map((aid) => ({
      id: aid,
      name: types.find((x) => x.id === aid)?.name ?? "",
    })),
    childIds: types.filter((x) => x.parentId === id).map((x) => x.id),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

/** Active users for the `user` field picker: id and display name only. */
export function listActiveUsers(db: AppDb): { id: string; displayName: string }[] {
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(isNull(users.disabledAt))
    .orderBy(asc(users.displayName))
    .all();
}

// --- Writes ------------------------------------------------------------------------

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ItemTypeError(422, "INVALID", r.error.issues[0]?.message);
  return r.data;
}

function assertTreeValid(types: TypeRecord[]) {
  const problem = validateTypeTree(types)[0];
  if (!problem) return;
  if (problem.code === "cycle") throw new ItemTypeError(409, "CYCLE");
  throw new ItemTypeError(409, "KEY_COLLISION", problem.key);
}

function assertParent(types: TypeRecord[], parentId: string | null) {
  if (parentId && !types.some((t) => t.id === parentId))
    throw new ItemTypeError(422, "PARENT_NOT_FOUND");
}

const logEvent = (db: AppDb, actorId: string, action: string, diff: unknown) =>
  db.insert(events).values({ itemId: null, actorId, action, diff }).run();

export function createItemType(db: AppDb, ctx: AuthCtx, raw: CreateItemTypeInput): { id: string } {
  assertCanCreate(ctx);
  const input = parseOrThrow(createItemTypeInput, raw);
  return db.transaction((tx) => {
    const types = loadTypes(tx as unknown as AppDb);
    if (types.some((t) => t.key === input.key)) throw new ItemTypeError(409, "KEY_TAKEN");
    assertParent(types, input.parentId);
    const id = Bun.randomUUIDv7();
    const now = new Date();
    assertTreeValid([
      ...types,
      { ...input, id, createdBy: ctx.userId, createdAt: now, updatedAt: now, archivedAt: null },
    ]);
    tx.insert(itemTypes)
      .values({
        id,
        key: input.key,
        name: input.name,
        icon: input.icon,
        tracking: input.tracking,
        parentId: input.parentId,
        fields: input.fields,
        createdBy: ctx.userId,
      })
      .run();
    logEvent(tx as unknown as AppDb, ctx.userId, "item_type.created", {
      typeId: id,
      key: input.key,
      name: input.name,
      parentId: input.parentId,
      tracking: input.tracking,
      fields: input.fields,
    });
    return { id };
  });
}

export type MigrationPreview = {
  /** Items whose stored attributes would change. */
  affectedItems: number;
  /** Per field key: how many items lose the value, how many get it converted. */
  byKey: { key: string; label: string; removed: number; converted: number }[];
};

type PlannedUpdate = {
  type: TypeRecord;
  next: TypeRecord;
  preview: MigrationPreview;
  changes: { id: string; before: Record<string, unknown>; plan: MigrationPlan }[];
};

/**
 * Applies the update in memory: keeps removed fields as hidden, checks the
 * tree, and plans the attribute migration of every item of the type and its
 * subtypes (their effective fields change with it).
 */
function planUpdate(db: AppDb, ctx: AuthCtx, raw: UpdateItemTypeInput): PlannedUpdate {
  const input = parseOrThrow(updateItemTypeInput, raw);
  const types = loadTypes(db);
  const type = findType(types, input.id);
  assertCanEdit(db, ctx, types, type);
  assertParent(types, input.parentId);
  if (wouldCreateCycle(types, type.id, input.parentId)) throw new ItemTypeError(409, "CYCLE");

  // Removing a field hides it (DESIGN §4.3): keys never disappear from a type.
  const newKeys = new Set(input.fields.map((f) => f.key));
  const fields = [
    ...input.fields,
    ...type.fields.filter((f) => !newKeys.has(f.key)).map((f) => ({ ...f, hidden: true })),
  ];
  const next: TypeRecord = {
    ...type,
    name: input.name,
    icon: input.icon,
    tracking: input.tracking,
    parentId: input.parentId,
    fields,
  };
  const nextTypes = types.map((t) => (t.id === type.id ? next : t));
  assertTreeValid(nextTypes);

  const affectedTypeIds = typeAndDescendantIds(nextTypes, type.id);
  const effective = new Map(affectedTypeIds.map((id) => [id, resolveFields(nextTypes, id)]));
  const rows = db
    .select({ id: items.id, typeId: items.typeId, attributes: items.attributes })
    .from(items)
    .where(inArray(items.typeId, affectedTypeIds))
    .all();

  const labels = new Map<string, string>();
  for (const list of effective.values()) for (const f of list) labels.set(f.key, f.label);
  const byKey = new Map<string, { removed: number; converted: number }>();
  const changes: PlannedUpdate["changes"] = [];
  for (const row of rows) {
    const before = (row.attributes ?? {}) as Record<string, unknown>;
    const plan = planAttributes(effective.get(row.typeId) ?? [], before);
    if (!planNeedsConfirmation(plan)) continue;
    changes.push({ id: row.id, before, plan });
    for (const k of plan.removed) {
      const e = byKey.get(k) ?? { removed: 0, converted: 0 };
      e.removed++;
      byKey.set(k, e);
    }
    for (const k of plan.converted) {
      const e = byKey.get(k) ?? { removed: 0, converted: 0 };
      e.converted++;
      byKey.set(k, e);
    }
  }
  return {
    type,
    next,
    changes,
    preview: {
      affectedItems: changes.length,
      byKey: [...byKey.entries()].map(([key, v]) => ({ key, label: labels.get(key) ?? key, ...v })),
    },
  };
}

/** Dry run of updateItemType: what would happen to stored values. */
export function previewItemTypeUpdate(
  db: AppDb,
  ctx: AuthCtx,
  input: UpdateItemTypeInput,
): MigrationPreview {
  return planUpdate(db, ctx, input).preview;
}

export type UpdateResult =
  | { status: "saved"; migratedItems: number }
  | { status: "confirm"; preview: MigrationPreview };

/**
 * Saves a type. If stored values would be removed or converted, nothing is
 * written and the preview is returned, unless `confirmAffected` equals the
 * current number of affected items; then the type and all item migrations are
 * written in one transaction, with an `item.attributes_migrated` event per item.
 */
export function updateItemType(db: AppDb, ctx: AuthCtx, input: UpdateItemTypeInput): UpdateResult {
  return db.transaction((tx) => {
    const d = tx as unknown as AppDb;
    const { type, next, changes, preview } = planUpdate(d, ctx, input);
    if (changes.length > 0 && input.confirmAffected !== changes.length)
      return { status: "confirm", preview };

    tx.update(itemTypes)
      .set({
        name: next.name,
        icon: next.icon,
        tracking: next.tracking,
        parentId: next.parentId,
        fields: next.fields,
      })
      .where(eq(itemTypes.id, type.id))
      .run();
    for (const c of changes) {
      const current = tx
        .select({ version: items.version })
        .from(items)
        .where(eq(items.id, c.id))
        .get();
      tx.update(items)
        .set({ attributes: c.plan.attributes, version: (current?.version ?? 1) + 1 })
        .where(eq(items.id, c.id))
        .run();
      tx.insert(events)
        .values({
          itemId: c.id,
          actorId: ctx.userId,
          action: "item.attributes_migrated",
          diff: {
            typeId: type.id,
            removed: c.plan.removed,
            converted: c.plan.converted,
            attributes: diffFields(c.before, c.plan.attributes),
          },
        })
        .run();
    }
    const meta = diffFields(
      { name: type.name, icon: type.icon, tracking: type.tracking, parentId: type.parentId },
      { name: next.name, icon: next.icon, tracking: next.tracking, parentId: next.parentId },
    );
    logEvent(d, ctx.userId, "item_type.updated", {
      typeId: type.id,
      key: type.key,
      changes: meta,
      fields: fieldChanges(type.fields, next.fields),
      migratedItems: changes.length,
    });
    return { status: "saved", migratedItems: changes.length };
  });
}

/** Compact per-key summary of field definition changes for the event log. */
function fieldChanges(before: FieldDefinition[], after: FieldDefinition[]) {
  const old = new Map(before.map((f) => [f.key, f]));
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of after) {
    const o = old.get(f.key);
    if (JSON.stringify(o) !== JSON.stringify(f)) out[f.key] = { from: o ?? null, to: f };
  }
  const order = (l: FieldDefinition[]) => l.map((f) => f.key).join(",");
  if (order(before) !== order(after))
    out["(order)"] = { from: before.map((f) => f.key), to: after.map((f) => f.key) };
  return out;
}

export function archiveItemType(
  db: AppDb,
  ctx: AuthCtx,
  input: { id: string; archived: boolean },
): void {
  db.transaction((tx) => {
    const d = tx as unknown as AppDb;
    const types = loadTypes(d);
    const t = findType(types, input.id);
    assertCanEdit(d, ctx, types, t);
    if (Boolean(t.archivedAt) === input.archived) return;
    tx.update(itemTypes)
      .set({ archivedAt: input.archived ? new Date() : null })
      .where(eq(itemTypes.id, t.id))
      .run();
    logEvent(d, ctx.userId, input.archived ? "item_type.archived" : "item_type.unarchived", {
      typeId: t.id,
      key: t.key,
    });
  });
}

/** Deletes a type without items and without subtypes (otherwise 409: archive instead). */
export function deleteItemType(db: AppDb, ctx: AuthCtx, input: { id: string }): void {
  db.transaction((tx) => {
    const d = tx as unknown as AppDb;
    const types = loadTypes(d);
    const t = findType(types, input.id);
    assertCanEdit(d, ctx, types, t);
    if (types.some((x) => x.parentId === t.id)) throw new ItemTypeError(409, "HAS_CHILDREN");
    const used = tx.select({ n: count() }).from(items).where(eq(items.typeId, t.id)).get();
    if ((used?.n ?? 0) > 0) throw new ItemTypeError(409, "HAS_ITEMS");
    tx.delete(itemTypes).where(eq(itemTypes.id, t.id)).run();
    logEvent(d, ctx.userId, "item_type.deleted", {
      typeId: t.id,
      key: t.key,
      name: t.name,
      parentId: t.parentId,
      tracking: t.tracking,
      fields: t.fields,
    });
  });
}

// --- Helpers for the items feature ----------------------------------------------------

/**
 * Preview (and result) of moving an item to another type: which values carry
 * over, which become legacy ("Alte Felder"), which are lost, and which required
 * fields of the new type are still empty. Write `plan.attributes` on confirm.
 */
export function planItemTypeChange(
  db: AppDb,
  input: { attributes: Record<string, unknown>; toTypeId: string },
): MigrationPlan {
  return planAttributes(effectiveFieldsForType(db, input.toTypeId), input.attributes ?? {});
}

/**
 * Server-side attribute check for saving an item: validates active fields,
 * carries legacy values over from `previous` (see prepareAttributes), and
 * rejects references to users that don't exist. Item references are the items
 * feature's job (they need the visibility predicate).
 */
export function prepareItemAttributes(
  db: AppDb,
  input: {
    typeId: string;
    attributes: Record<string, unknown>;
    previous?: Record<string, unknown>;
  },
): ReturnType<typeof prepareAttributes> {
  const fields = effectiveFieldsForType(db, input.typeId);
  const r = prepareAttributes(fields, input.attributes ?? {}, input.previous ?? {});
  if (!r.ok) return r;
  const userFields = fields.filter((f) => f.kind === "user" && !f.hidden);
  if (userFields.length === 0) return r;
  const ids = new Set<string>();
  for (const f of userFields) {
    const v = r.attributes[f.key];
    for (const id of Array.isArray(v) ? v : v === undefined ? [] : [v]) ids.add(String(id));
  }
  if (ids.size === 0) return r;
  const known = new Set(
    db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.id, [...ids]))
      .all()
      .map((u) => u.id),
  );
  const errors: Record<string, string> = {};
  for (const f of userFields) {
    const v = r.attributes[f.key];
    const list = Array.isArray(v) ? v : v === undefined ? [] : [v];
    if (list.some((id) => !known.has(String(id)))) errors[f.key] = m.field_error_unknown_user();
  }
  return Object.keys(errors).length ? { ok: false, errors } : r;
}
