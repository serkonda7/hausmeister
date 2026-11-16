// Tag helpers shared by the items and tags services (run inside their
// transactions). Tag names are matched case-insensitively ("Garten" and
// "garten" are one tag); the first spelling wins.
import { asc, eq, inArray } from "drizzle-orm";
import type { TagRef } from "../../lib/items/types";
import type { AuthCtx } from "../authz/ctx";
import type { DbOrTx } from "../db/client";
import { itemTags, tags } from "../db/schema";
import { recordCatalogEvent } from "../history/record";

export const tagKey = (name: string) => name.trim().toLocaleLowerCase("de");

/** The tags with these names, creating missing ones (logged as tag.created). */
export function findOrCreateTags(db: DbOrTx, ctx: AuthCtx, names: readonly string[]): TagRef[] {
  const wanted = new Map<string, string>();
  for (const n of names) {
    const name = n.trim();
    if (name && !wanted.has(tagKey(name))) wanted.set(tagKey(name), name);
  }
  if (wanted.size === 0) return [];
  const existing = new Map(
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .all()
      .map((t) => [tagKey(t.name), t]),
  );
  const out: TagRef[] = [];
  for (const [key, name] of wanted) {
    let t = existing.get(key);
    if (!t) {
      t = db
        .insert(tags)
        .values({ name })
        .returning({ id: tags.id, name: tags.name, color: tags.color })
        .get();
      recordCatalogEvent(db, {
        actorId: ctx.userId,
        action: "tag.created",
        diff: { tagId: t.id, name },
      });
    }
    out.push(t);
  }
  return out;
}

/** The item's tag names, sorted. */
export function itemTagNames(db: DbOrTx, itemId: string): string[] {
  return db
    .select({ name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(tags.id, itemTags.tagId))
    .where(eq(itemTags.itemId, itemId))
    .orderBy(asc(tags.name))
    .all()
    .map((r) => r.name);
}

/** Replaces the item's tag set. */
export function replaceItemTags(db: DbOrTx, itemId: string, tagIds: readonly string[]) {
  db.delete(itemTags).where(eq(itemTags.itemId, itemId)).run();
  const ids = [...new Set(tagIds)];
  if (ids.length)
    db.insert(itemTags)
      .values(ids.map((tagId) => ({ itemId, tagId })))
      .run();
}

/** Items carrying any of these tags. */
export function itemIdsWithTags(db: DbOrTx, tagIds: readonly string[]): string[] {
  if (tagIds.length === 0) return [];
  return [
    ...new Set(
      db
        .select({ id: itemTags.itemId })
        .from(itemTags)
        .where(inArray(itemTags.tagId, [...tagIds]))
        .all()
        .map((r) => r.id),
    ),
  ];
}
