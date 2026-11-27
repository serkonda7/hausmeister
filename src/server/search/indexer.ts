// Keeps items_fts (and items.name_sort) in step with the items, from
// application code (DESIGN §5.4). Every write path of the items, tags and
// item-types modules calls reindexItems / removeFromIndex inside its
// transaction. Index text and query go through the same normalizeSearchText
// (lowercase, ß -> ss, diacritics removed).
//
// Not indexed on purpose: names of referenced items (`item` fields). Indexing
// them would let a search for a private item's name find the items pointing at
// it, and would go stale when the referenced item is renamed.
import { eq, inArray, sql } from 'drizzle-orm'
import { flattenAttributesForSearch } from '../../lib/item-types/display'
import { parseStoredFields } from '../../lib/item-types/fields'
import { type EffectiveField, resolveFields } from '../../lib/item-types/tree'
import { normalizeSearchText } from '../../lib/normalize'
import type { DbOrTx } from '../db/client'
import { type Item, items, itemTags, itemTypes, tags, users } from '../db/schema'
import { itemsFts } from './fts'

const CHUNK = 400

function chunks<T>(list: readonly T[]): T[][] {
	const out: T[][] = []
	for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
	return out
}

export type SearchDocument = { name: string; description: string; tags: string; attrs: string }

/** The four indexed columns of one item. */
export function searchDocument(
	item: Pick<Item, 'name' | 'description' | 'attributes' | 'shortCode' | 'barcode'>,
	tagNames: readonly string[],
	fields: readonly EffectiveField[],
	userName: (id: string) => string | undefined,
): SearchDocument {
	const attrs = flattenAttributesForSearch(fields, item.attributes ?? {}, { userName })
	const codes = normalizeSearchText([item.shortCode ?? '', item.barcode ?? ''].join(' '))
	return {
		name: normalizeSearchText(item.name),
		description: normalizeSearchText(item.description ?? ''),
		tags: normalizeSearchText(tagNames.join(' ')),
		attrs: [attrs, codes].filter(Boolean).join(' '),
	}
}

type Resolver = {
	fieldsOf: (typeId: string) => EffectiveField[]
	userName: (id: string) => string | undefined
}

function makeResolver(db: DbOrTx): Resolver {
	const types = db
		.select()
		.from(itemTypes)
		.all()
		.map((t) => ({ ...t, fields: parseStoredFields(t.fields) }))
	const cache = new Map<string, EffectiveField[]>()
	const names = new Map(
		db
			.select({ id: users.id, displayName: users.displayName })
			.from(users)
			.all()
			.map((u) => [u.id, u.displayName]),
	)
	return {
		fieldsOf: (typeId) => {
			let f = cache.get(typeId)
			if (!f) {
				f = types.some((t) => t.id === typeId) ? resolveFields(types, typeId) : []
				cache.set(typeId, f)
			}
			return f
		},
		userName: (id) => names.get(id),
	}
}

/** Removes the items from the index (deleted items). */
export function removeFromIndex(db: DbOrTx, ids: readonly string[]) {
	for (const part of chunks([...new Set(ids)]))
		db.delete(itemsFts).where(inArray(itemsFts.itemId, part)).run()
}

/**
 * (Re)writes the index rows of the given items from their current state, and
 * fixes their name_sort. Ids that no longer exist are removed from the index.
 */
export function reindexItems(db: DbOrTx, ids: readonly string[], resolver?: Resolver) {
	const unique = [...new Set(ids)]
	if (unique.length === 0) return
	const r = resolver ?? makeResolver(db)
	for (const part of chunks(unique)) {
		const rows = db.select().from(items).where(inArray(items.id, part)).all()
		const tagRows = db
			.select({ itemId: itemTags.itemId, name: tags.name })
			.from(itemTags)
			.innerJoin(tags, eq(tags.id, itemTags.tagId))
			.where(inArray(itemTags.itemId, part))
			.all()
		const tagsOf = new Map<string, string[]>()
		for (const t of tagRows) tagsOf.set(t.itemId, [...(tagsOf.get(t.itemId) ?? []), t.name])
		db.delete(itemsFts).where(inArray(itemsFts.itemId, part)).run()
		for (const it of rows) {
			const doc = searchDocument(
				it,
				tagsOf.get(it.id) ?? [],
				r.fieldsOf(it.typeId),
				r.userName,
			)
			db.insert(itemsFts)
				.values({ itemId: it.id, ...doc })
				.run()
			if (it.nameSort !== doc.name)
				db.update(items).set({ nameSort: doc.name }).where(eq(items.id, it.id)).run()
		}
	}
}

/** Reindexes every item of these types (field labels or values changed). */
export function reindexItemsOfTypes(db: DbOrTx, typeIds: readonly string[]) {
	if (typeIds.length === 0) return
	const ids = db
		.select({ id: items.id })
		.from(items)
		.where(inArray(items.typeId, [...typeIds]))
		.all()
		.map((r) => r.id)
	reindexItems(db, ids)
}

/**
 * Reindexes the items whose attributes mention this user (values of `user`
 * fields are indexed by display name). Matches the id anywhere in the stored
 * attributes JSON (instr on the text: one scan of items, fine at household
 * scale); an id that happens to sit in another field only costs a needless
 * reindex. Returns the number of items reindexed.
 */
export function reindexItemsReferencingUser(db: DbOrTx, userId: string): number {
	const ids = db
		.select({ id: items.id })
		.from(items)
		.where(sql`instr(${items.attributes}, ${userId}) > 0`)
		.all()
		.map((r) => r.id)
	reindexItems(db, ids)
	return ids.length
}

/** Drops and rewrites the whole index. Returns the number of indexed items. */
export function rebuildSearchIndex(db: DbOrTx): number {
	return db.transaction((tx) => {
		tx.delete(itemsFts).run()
		const ids = tx
			.select({ id: items.id })
			.from(items)
			.all()
			.map((r) => r.id)
		reindexItems(tx, ids, makeResolver(tx))
		return ids.length
	})
}

/**
 * True when the index does not cover exactly the items (missing or extra
 * rows, duplicates) or some item lacks its name_sort.
 */
export function searchIndexOutOfStep(db: DbOrTx): boolean {
	const row = db
		.select({
			items: sql<number>`(select count(*) from ${items})`,
			indexed: sql<number>`(select count(*) from ${itemsFts})`,
			distinct: sql<number>`(select count(distinct ${itemsFts.itemId}) from ${itemsFts})`,
			missing: sql<number>`(select count(*) from ${items} where ${items.id} not in (select ${itemsFts.itemId} from ${itemsFts}))`,
			unsorted: sql<number>`(select count(*) from ${items} where ${items.nameSort} is null)`,
		})
		.from(sql`(select 1)`)
		.get()
	if (!row) return false
	return (
		row.items !== row.indexed ||
		row.indexed !== row.distinct ||
		row.missing > 0 ||
		row.unsorted > 0
	)
}

/** Rebuilds the index when it is out of step. Returns true when it rebuilt. */
export function ensureSearchIndex(db: DbOrTx): boolean {
	if (!searchIndexOutOfStep(db)) return false
	rebuildSearchIndex(db)
	return true
}
