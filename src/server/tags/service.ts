// Tags: attach/detach on items (needs `edit`, creates tags by name on the fly),
// list, and admin maintenance (rename, recolour, merge, delete). Every change
// that alters an item's tag set writes an item.updated event with a `tags`
// diff and reindexes the item; renames reindex the tagged items.
//
// Listing: admins see every tag; others see the tags that are on at least one
// item they can see, plus unused tags (a tag name only used on someone's
// private items is that person's business). Counts only count visible items.
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import {
  idSchema,
  mergeTagsInput,
  recolorTagInput,
  renameTagInput,
  tagAttachInput,
  tagDetachInput,
} from "../../lib/items/inputs";
import type { TagSummary } from "../../lib/items/types";
import { visibleItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import { items, itemTags, tags } from "../db/schema";
import { recordCatalogEvent, recordItemEvent } from "../history/record";
import { assertVersion, requireItem, writeVersioned } from "../items/access";
import { ItemsError, parseInput } from "../items/errors";
import { reindexItems } from "../search/indexer";
import { findOrCreateTags, itemIdsWithTags, itemTagNames, tagKey, tagVisibleWhere } from "./core";

const tagNotFound = () => new ItemsError(404, "TAG_NOT_FOUND");

function requireAdmin(ctx: AuthCtx) {
  if (ctx.role !== "admin") throw new ItemsError(403, "TAG_FORBIDDEN");
}

export function listTags(db: AppDb, ctx: AuthCtx): TagSummary[] {
  const counts = new Map(
    db
      .select({ id: itemTags.tagId, n: count() })
      .from(itemTags)
      .innerJoin(items, eq(items.id, itemTags.itemId))
      .where(visibleItemsWhere(ctx))
      .groupBy(itemTags.tagId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(tagVisibleWhere(ctx, db))
    .orderBy(asc(sql`${tags.name} collate nocase`))
    .all()
    .map((t) => ({ ...t, count: counts.get(t.id) ?? 0 }));
}

/** Records an item's tag change (event, version bump, reindex). */
function tagChanged(
  db: DbOrTx,
  ctx: AuthCtx,
  item: { id: string; version: number },
  from: string[],
  bump = true,
): number {
  const to = itemTagNames(db, item.id);
  const version = bump ? writeVersioned(db, item.id, item.version, {}) : item.version;
  recordItemEvent(db, {
    actorId: ctx.userId,
    action: "item.updated",
    itemId: item.id,
    diff: { tags: { from, to } },
  });
  reindexItems(db, [item.id]);
  return version;
}

/** Puts a tag (by name; created if new) on an item. Needs edit. */
export function attachTag(
  db: AppDb,
  ctx: AuthCtx,
  raw: { itemId: string; version: number; name: string },
): { version: number; tagId: string } {
  const input = parseInput(tagAttachInput, raw);
  return db.transaction((tx) => {
    const { item } = requireItem(tx, ctx, input.itemId, "edit");
    assertVersion(item, input.version);
    const [tag] = findOrCreateTags(tx, ctx, [input.name]);
    const from = itemTagNames(tx, item.id);
    const has = tx
      .select({ id: itemTags.tagId })
      .from(itemTags)
      .where(and(eq(itemTags.itemId, item.id), eq(itemTags.tagId, tag!.id)))
      .get();
    if (has) return { version: item.version, tagId: tag!.id };
    tx.insert(itemTags).values({ itemId: item.id, tagId: tag!.id }).run();
    return { version: tagChanged(tx, ctx, item, from), tagId: tag!.id };
  });
}

export function detachTag(
  db: AppDb,
  ctx: AuthCtx,
  raw: { itemId: string; version: number; tagId: string },
): { version: number } {
  const input = parseInput(tagDetachInput, raw);
  return db.transaction((tx) => {
    const { item } = requireItem(tx, ctx, input.itemId, "edit");
    assertVersion(item, input.version);
    const from = itemTagNames(tx, item.id);
    const r = tx
      .delete(itemTags)
      .where(and(eq(itemTags.itemId, item.id), eq(itemTags.tagId, input.tagId)))
      .run() as unknown as { changes: number };
    if (r.changes === 0) return { version: item.version };
    return { version: tagChanged(tx, ctx, item, from) };
  });
}

function requireTag(db: DbOrTx, id: string) {
  const t = db.select().from(tags).where(eq(tags.id, id)).get();
  if (!t) throw tagNotFound();
  return t;
}

/** Admin. A name another tag already has (ignoring case) is TAG_NAME_TAKEN: merge instead. */
export function renameTag(db: AppDb, ctx: AuthCtx, raw: { id: string; name: string }) {
  requireAdmin(ctx);
  const input = parseInput(renameTagInput, raw);
  db.transaction((tx) => {
    const t = requireTag(tx, input.id);
    if (t.name === input.name) return;
    const clash = tx
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .all()
      .some((o) => o.id !== t.id && tagKey(o.name) === tagKey(input.name));
    if (clash) throw new ItemsError(409, "TAG_NAME_TAKEN");
    tx.update(tags).set({ name: input.name }).where(eq(tags.id, t.id)).run();
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "tag.renamed",
      diff: { tagId: t.id, name: { from: t.name, to: input.name } },
    });
    reindexItems(tx, itemIdsWithTags(tx, [t.id]));
  });
}

export function recolorTag(db: AppDb, ctx: AuthCtx, raw: { id: string; color: string | null }) {
  requireAdmin(ctx);
  const input = parseInput(recolorTagInput, raw);
  db.transaction((tx) => {
    const t = requireTag(tx, input.id);
    if (t.color === input.color) return;
    tx.update(tags).set({ color: input.color }).where(eq(tags.id, t.id)).run();
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "tag.recolored",
      diff: { tagId: t.id, color: { from: t.color, to: input.color } },
    });
  });
}

/** Admin: every item tagged `source` gets `target` instead; `source` is deleted. */
export function mergeTags(
  db: AppDb,
  ctx: AuthCtx,
  raw: { sourceId: string; targetId: string },
): { items: number } {
  requireAdmin(ctx);
  const input = parseInput(mergeTagsInput, raw);
  if (input.sourceId === input.targetId) throw new ItemsError(422, "TAG_MERGE_SELF");
  return db.transaction((tx) => {
    const source = requireTag(tx, input.sourceId);
    const target = requireTag(tx, input.targetId);
    const affected = itemIdsWithTags(tx, [source.id]);
    const before = new Map(affected.map((id) => [id, itemTagNames(tx, id)]));
    for (const id of affected)
      tx.insert(itemTags).values({ itemId: id, tagId: target.id }).onConflictDoNothing().run();
    tx.delete(tags).where(eq(tags.id, source.id)).run();
    const versions = new Map(
      affected.length
        ? tx
            .select({ id: items.id, version: items.version })
            .from(items)
            .where(inArray(items.id, affected))
            .all()
            .map((r) => [r.id, r.version])
        : [],
    );
    for (const id of affected)
      tagChanged(tx, ctx, { id, version: versions.get(id)! }, before.get(id) ?? []);
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "tag.merged",
      diff: {
        sourceId: source.id,
        sourceName: source.name,
        targetId: target.id,
        items: affected.length,
      },
    });
    return { items: affected.length };
  });
}

/** Admin: removes the tag from every item and deletes it. */
export function deleteTag(db: AppDb, ctx: AuthCtx, raw: { id: string }): { items: number } {
  requireAdmin(ctx);
  const id = parseInput(idSchema, raw?.id);
  return db.transaction((tx) => {
    const t = requireTag(tx, id);
    const affected = itemIdsWithTags(tx, [t.id]);
    const before = new Map(affected.map((i) => [i, itemTagNames(tx, i)]));
    tx.delete(tags).where(eq(tags.id, t.id)).run();
    const versions = new Map(
      affected.length
        ? tx
            .select({ id: items.id, version: items.version })
            .from(items)
            .where(inArray(items.id, affected))
            .all()
            .map((r) => [r.id, r.version])
        : [],
    );
    for (const i of affected)
      tagChanged(tx, ctx, { id: i, version: versions.get(i)! }, before.get(i) ?? []);
    recordCatalogEvent(tx, {
      actorId: ctx.userId,
      action: "tag.deleted",
      diff: { tagId: t.id, name: t.name, items: affected.length },
    });
    return { items: affected.length };
  });
}
