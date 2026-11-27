// Tag helpers shared by the items and tags services (run inside their
// transactions). Tag names are matched case-insensitively ("Garten" and
// "garten" are one tag); the first spelling wins.
//
// Matching only considers tags the caller can see (tagVisibleWhere), so typing
// a name never reveals a tag used only on hidden items. A case variant of such
// a tag creates a second tag (admins can merge them); the exact spelling reuses
// it, because refusing would confirm it exists just the same.
import { and, asc, eq, exists, inArray, not, or, type SQL, sql } from 'drizzle-orm'
import type { TagRef } from '../../lib/items/types'
import { visibleItemsWhere } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { DbOrTx } from '../db/client'
import { items, itemTags, tags } from '../db/schema'
import { recordCatalogEvent } from '../history/record'

export const tagKey = (name: string) => name.trim().toLocaleLowerCase('de')

/**
 * Tags ctx can see: admins all; others the tags on at least one item they can
 * see, plus unused tags. `undefined` means no restriction.
 */
export function tagVisibleWhere(ctx: AuthCtx, db: DbOrTx): SQL | undefined {
	if (ctx.role === 'admin') return undefined
	const onVisible = db
		.select({ x: sql`1` })
		.from(itemTags)
		.innerJoin(items, eq(items.id, itemTags.itemId))
		.where(and(eq(itemTags.tagId, tags.id), visibleItemsWhere(ctx)))
	const used = db.select({ x: sql`1` }).from(itemTags).where(eq(itemTags.tagId, tags.id))
	return or(exists(onVisible), not(exists(used)))
}

/** The tags with these names, creating missing ones (logged as tag.created). */
export function findOrCreateTags(db: DbOrTx, ctx: AuthCtx, names: readonly string[]): TagRef[] {
	const wanted = new Map<string, string>()
	for (const n of names) {
		const name = n.trim()
		if (name && !wanted.has(tagKey(name))) wanted.set(tagKey(name), name)
	}
	if (wanted.size === 0) return []
	const cols = { id: tags.id, name: tags.name, color: tags.color }
	// Visible tags by key; an exact spelling beats another case variant.
	const existing = new Map<string, TagRef>()
	for (const t of db
		.select(cols)
		.from(tags)
		.where(tagVisibleWhere(ctx, db))
		.orderBy(asc(tags.name))
		.all()) {
		const key = tagKey(t.name)
		const cur = existing.get(key)
		if (!cur || (t.name === wanted.get(key) && cur.name !== t.name)) existing.set(key, t)
	}
	const out: TagRef[] = []
	for (const [key, name] of wanted) {
		let t = existing.get(key) ?? db.select(cols).from(tags).where(eq(tags.name, name)).get()
		if (!t) {
			t = db
				.insert(tags)
				.values({ name })
				.returning({ id: tags.id, name: tags.name, color: tags.color })
				.get()
			recordCatalogEvent(db, {
				actorId: ctx.userId,
				action: 'tag.created',
				diff: { tagId: t.id, name },
			})
		}
		out.push(t)
	}
	return out
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
		.map((r) => r.name)
}

/** Replaces the item's tag set. */
export function replaceItemTags(db: DbOrTx, itemId: string, tagIds: readonly string[]) {
	db.delete(itemTags).where(eq(itemTags.itemId, itemId)).run()
	const ids = [...new Set(tagIds)]
	if (ids.length)
		db.insert(itemTags)
			.values(ids.map((tagId) => ({ itemId, tagId })))
			.run()
}

/** Items carrying any of these tags. */
export function itemIdsWithTags(db: DbOrTx, tagIds: readonly string[]): string[] {
	if (tagIds.length === 0) return []
	return [
		...new Set(
			db
				.select({ id: itemTags.itemId })
				.from(itemTags)
				.where(inArray(itemTags.tagId, [...tagIds]))
				.all()
				.map((r) => r.id),
		),
	]
}
