import { and, eq, inArray } from 'drizzle-orm'
import type { getDb } from '../db'
import {
	authors,
	bookAuthors,
	bookLanguages,
	bookReads,
	type books,
	bookTags,
	languages,
	publishers,
	tags,
	users,
} from '../schema'
import { normalizePageNotes } from '../util/page-notes'
import type { BooksDb } from './books-types'
import { buildLocationPath, locationFullPath, locationMaps } from './locations-tree'
import { ownershipOf, provenanceMap } from './provenance'

export { ownershipOf, provenanceMap }

export function authorMap(
	db: BooksDb,
	bookIds: string[],
): Map<string, Array<{ id: string; name: string }>> {
	const map = new Map<string, Array<{ id: string; name: string }>>()
	if (bookIds.length === 0) {
		return map
	}
	const links = db.select().from(bookAuthors).where(inArray(bookAuthors.bookId, bookIds)).all()
	if (links.length === 0) {
		return map
	}
	const authorIds = [...new Set(links.map((l) => l.authorId))]
	const rows = db.select().from(authors).where(inArray(authors.id, authorIds)).all()
	const byId = new Map(rows.map((a) => [a.id, a]))
	for (const link of links) {
		const author = byId.get(link.authorId)
		if (!author) {
			continue
		}
		const list = map.get(link.bookId) ?? []
		list.push({ id: author.id, name: author.name })
		map.set(link.bookId, list)
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name))
	}
	return map
}

export function publisherMap(
	db: BooksDb,
	publisherIds: string[],
): Map<string, { id: string; name: string }> {
	const map = new Map<string, { id: string; name: string }>()
	const ids = [...new Set(publisherIds.filter(Boolean))]
	if (ids.length === 0) {
		return map
	}
	const rows = db.select().from(publishers).where(inArray(publishers.id, ids)).all()
	for (const p of rows) {
		map.set(p.id, { id: p.id, name: p.name })
	}
	return map
}

export function tagMap(
	db: BooksDb,
	bookIds: string[],
): Map<string, Array<{ id: string; name: string }>> {
	const map = new Map<string, Array<{ id: string; name: string }>>()
	if (bookIds.length === 0) {
		return map
	}
	const links = db.select().from(bookTags).where(inArray(bookTags.bookId, bookIds)).all()
	if (links.length === 0) {
		return map
	}
	const tagIds = [...new Set(links.map((l) => l.tagId))]
	const rows = db.select().from(tags).where(inArray(tags.id, tagIds)).all()
	const byId = new Map(rows.map((t) => [t.id, t]))
	for (const link of links) {
		const tag = byId.get(link.tagId)
		if (!tag) {
			continue
		}
		const list = map.get(link.bookId) ?? []
		list.push({ id: tag.id, name: tag.name })
		map.set(link.bookId, list)
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name))
	}
	return map
}

export function languageMap(db: BooksDb, bookIds: string[]) {
	const map = new Map<string, Array<{ id: string; name: string }>>()
	if (!bookIds.length) return map
	const links = db.select().from(bookLanguages).where(inArray(bookLanguages.bookId, bookIds)).all()
	if (links.length === 0) return map
	const rows = db
		.select()
		.from(languages)
		.where(inArray(languages.id, [...new Set(links.map((l) => l.languageId))]))
		.all()
	const byId = new Map(rows.map((l) => [l.id, l]))
	for (const link of links) {
		const language = byId.get(link.languageId)
		if (!language) continue
		const list = map.get(link.bookId) ?? []
		list.push({ id: language.id, name: language.name })
		map.set(link.bookId, list)
	}
	for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
	return map
}

/** When the viewer marked each book as read (absent = unread). */
export function readMap(db: BooksDb, userId: string, bookIds: string[]): Map<string, number> {
	const map = new Map<string, number>()
	if (bookIds.length === 0) {
		return map
	}
	const rows = db
		.select()
		.from(bookReads)
		.where(and(eq(bookReads.userId, userId), inArray(bookReads.bookId, bookIds)))
		.all()
	for (const r of rows) {
		map.set(r.bookId, r.readAt)
	}
	return map
}

export function ownerMap(
	db: BooksDb,
	ownerIds: string[],
): Map<string, { id: string; username: string; displayName: string | null }> {
	const map = new Map<string, { id: string; username: string; displayName: string | null }>()
	const ids = [...new Set(ownerIds.filter(Boolean))]
	if (ids.length === 0) {
		return map
	}
	const rows = db.select().from(users).where(inArray(users.id, ids)).all()
	for (const u of rows) {
		map.set(u.id, { id: u.id, username: u.username, displayName: u.displayName ?? null })
	}
	return map
}

export function ownersFor(db: BooksDb, rows: Array<typeof books.$inferSelect>) {
	return ownerMap(
		db,
		rows.map((b) => b.ownerId).filter((id): id is string => id !== null),
	)
}

export function locationsFor(db: BooksDb, rows: Array<typeof books.$inferSelect>) {
	const ids = rows.map((b) => b.locationId).filter((id): id is string => id !== null)
	if (ids.length === 0) return new Map()
	const { byId } = locationMaps(db)
	const map = new Map<
		string,
		{ id: string; name: string; parentId: string | null; fullPath: string }
	>()
	for (const id of new Set(ids)) {
		const row = byId.get(id)
		if (!row) continue
		const path = buildLocationPath(byId, id)
		map.set(id, {
			id: row.id,
			name: row.name,
			parentId: row.parentId ?? null,
			fullPath: locationFullPath(path),
		})
	}
	return map
}

export function toBookJson(
	row: typeof books.$inferSelect,
	authorsByBook: Map<string, Array<{ id: string; name: string }>>,
	publishersById: Map<string, { id: string; name: string }>,
	provenanceByBook?: Map<string, Array<{ kind: string } & Record<string, unknown>>>,
	tagsByBook?: Map<string, Array<{ id: string; name: string }>>,
	languagesByBook?: Map<string, Array<{ id: string; name: string }>>,
	ownersById?: Map<string, { id: string; username: string; displayName: string | null }>,
	locationsById?: Map<
		string,
		{ id: string; name: string; parentId: string | null; fullPath: string }
	>,
	readsByBook?: Map<string, number>,
) {
	const bookAuthorsList = authorsByBook.get(row.id) ?? []
	const bookTagsList = tagsByBook?.get(row.id) ?? []
	const bookLanguagesList = languagesByBook?.get(row.id) ?? []
	const provenance = (provenanceByBook?.get(row.id) ?? []) as Array<Record<string, unknown>>
	return {
		...row,
		dedications: normalizePageNotes(row.dedications),
		damages: normalizePageNotes(row.damages),
		authorIds: bookAuthorsList.map((a) => a.id),
		authors: bookAuthorsList,
		tagIds: bookTagsList.map((t) => t.id),
		tags: bookTagsList,
		languageIds: bookLanguagesList.map((l) => l.id),
		languages: bookLanguagesList,
		publisher: row.publisherId ? (publishersById.get(row.publisherId) ?? null) : null,
		owner: row.ownerId ? (ownersById?.get(row.ownerId) ?? null) : null,
		location: row.locationId ? (locationsById?.get(row.locationId) ?? null) : null,
		provenance,
		ownership: ownershipOf(provenance as Array<{ kind: string }>),
		readAt: readsByBook?.get(row.id) ?? null,
	}
}

export type EnrichedBook = ReturnType<typeof toBookJson>

/** Load every enrichment map needed to serialize a list of book rows. */
export function enrichBooks(
	db: ReturnType<typeof getDb>,
	rows: Array<typeof books.$inferSelect>,
	viewerId: string,
) {
	const bookIds = rows.map((b) => b.id)
	return {
		authorsByBook: authorMap(db, bookIds),
		publishersById: publisherMap(
			db,
			rows.map((b) => b.publisherId).filter((id): id is string => id !== null),
		),
		provenanceByBook: provenanceMap(db, bookIds),
		tagsByBook: tagMap(db, bookIds),
		languagesByBook: languageMap(db, bookIds),
		ownersById: ownersFor(db, rows),
		locationsById: locationsFor(db, rows),
		readsByBook: readMap(db, viewerId, bookIds),
	}
}

/** Serialize one row with single-id enrichment maps (detail/create/update responses). */
export function toSingleBookJson(
	db: ReturnType<typeof getDb>,
	row: typeof books.$inferSelect,
	viewerId: string,
) {
	return toBookJson(
		row,
		authorMap(db, [row.id]),
		publisherMap(db, row.publisherId ? [row.publisherId] : []),
		provenanceMap(db, [row.id]),
		tagMap(db, [row.id]),
		languageMap(db, [row.id]),
		ownerMap(db, row.ownerId ? [row.ownerId] : []),
		locationsFor(db, [row]),
		readMap(db, viewerId, [row.id]),
	)
}

/** Serialize many rows (list response). */
export function toBookListJson(
	db: ReturnType<typeof getDb>,
	rows: Array<typeof books.$inferSelect>,
	viewerId: string,
): EnrichedBook[] {
	const enriched = enrichBooks(db, rows, viewerId)
	return rows.map((b) =>
		toBookJson(
			b,
			enriched.authorsByBook,
			enriched.publishersById,
			enriched.provenanceByBook,
			enriched.tagsByBook,
			enriched.languagesByBook,
			enriched.ownersById,
			enriched.locationsById,
			enriched.readsByBook,
		),
	)
}
