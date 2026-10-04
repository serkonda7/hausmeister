import { and, eq, inArray } from 'drizzle-orm'
import { ownershipOf } from 'shared/src/book'
import type { Db } from '../db'
import {
	authors,
	bookAuthors,
	bookLanguages,
	bookReads,
	bookTags,
	languages,
	publishers,
	tags,
	users,
} from '../schema'
import type { BookRow } from '../util/books'
import { byName, groupBy } from '../util/query'
import { locationPaths } from './locations'
import { provenanceByBook } from './provenance'

type Named = { id: string; name: string }

function namesByBook(rows: Array<Named & { bookId: string }>): Map<string, Named[]> {
	const grouped = groupBy(rows, (r) => r.bookId)
	return new Map(
		[...grouped].map(([bookId, list]) => [
			bookId,
			list.map(({ id, name }) => ({ id, name })).sort(byName),
		]),
	)
}

/** Load everything needed to serialize `rows`, with one query per relation. */
function loadRelations(db: Db, rows: BookRow[], viewerId: string) {
	const bookIds = rows.map((b) => b.id)
	const publisherIds = rows.flatMap((b) => b.publisherId ?? [])
	const ownerIds = rows.flatMap((b) => b.ownerId ?? [])
	const authorRows = db
		.select({ bookId: bookAuthors.bookId, id: authors.id, name: authors.name })
		.from(bookAuthors)
		.innerJoin(authors, eq(bookAuthors.authorId, authors.id))
		.where(inArray(bookAuthors.bookId, bookIds))
		.all()
	const tagRows = db
		.select({ bookId: bookTags.bookId, id: tags.id, name: tags.name })
		.from(bookTags)
		.innerJoin(tags, eq(bookTags.tagId, tags.id))
		.where(inArray(bookTags.bookId, bookIds))
		.all()
	const languageRows = db
		.select({ bookId: bookLanguages.bookId, id: languages.id, name: languages.name })
		.from(bookLanguages)
		.innerJoin(languages, eq(bookLanguages.languageId, languages.id))
		.where(inArray(bookLanguages.bookId, bookIds))
		.all()
	const publisherRows = db
		.select({ id: publishers.id, name: publishers.name })
		.from(publishers)
		.where(inArray(publishers.id, publisherIds))
		.all()
	const ownerRows = db
		.select({ id: users.id, username: users.username, displayName: users.displayName })
		.from(users)
		.where(inArray(users.id, ownerIds))
		.all()
	const readRows = db
		.select()
		.from(bookReads)
		.where(and(eq(bookReads.userId, viewerId), inArray(bookReads.bookId, bookIds)))
		.all()
	return {
		authors: namesByBook(authorRows),
		tags: namesByBook(tagRows),
		languages: namesByBook(languageRows),
		publishers: new Map(publisherRows.map((p) => [p.id, p])),
		owners: new Map(ownerRows.map((u) => [u.id, u])),
		locations: locationPaths(db),
		provenance: provenanceByBook(db, bookIds),
		reads: new Map(readRows.map((r) => [r.bookId, r.readAt])),
	}
}

function toBookJson(row: BookRow, rel: ReturnType<typeof loadRelations>) {
	const bookAuthors = rel.authors.get(row.id) ?? []
	const bookTags = rel.tags.get(row.id) ?? []
	const bookLanguages = rel.languages.get(row.id) ?? []
	const provenance = rel.provenance.get(row.id) ?? []
	const location = row.locationId ? rel.locations.get(row.locationId) : undefined
	return {
		...row,
		authorIds: bookAuthors.map((a) => a.id),
		authors: bookAuthors,
		tagIds: bookTags.map((t) => t.id),
		tags: bookTags,
		languageIds: bookLanguages.map((l) => l.id),
		languages: bookLanguages,
		publisher: (row.publisherId && rel.publishers.get(row.publisherId)) || null,
		owner: (row.ownerId && rel.owners.get(row.ownerId)) || null,
		location: location
			? {
					id: location.id,
					name: location.name,
					parentId: location.parentId,
					fullPath: location.fullPath,
				}
			: null,
		provenance,
		ownership: ownershipOf(provenance),
		readAt: rel.reads.get(row.id) ?? null,
	}
}

export type BookJson = ReturnType<typeof toBookJson>

export function serializeBooks(db: Db, rows: BookRow[], viewerId: string): BookJson[] {
	const relations = loadRelations(db, rows, viewerId)
	return rows.map((row) => toBookJson(row, relations))
}

export function serializeBook(db: Db, row: BookRow, viewerId: string): BookJson {
	return toBookJson(row, loadRelations(db, [row], viewerId))
}

/** Lower-cased text of every searchable field, one field per line. */
function searchText(b: BookJson): string {
	return [
		b.title,
		b.subtitle,
		b.isbn,
		b.publisher?.name,
		b.location?.fullPath,
		b.owner?.displayName,
		b.owner?.username,
		b.ownership,
		...[...b.authors, ...b.tags, ...b.languages].map((n) => n.name),
		...[...b.dedications, ...b.damages].map((n) => `${n.page} ${n.text}`),
		...b.provenance.map((e) => `${e.kind} ${e.party ?? ''}`),
	]
		.filter(Boolean)
		.join('\n')
		.toLowerCase()
}

export type BookFilter = {
	q?: string
	owner?: string
	location?: string
	author?: string
	publisher?: string
}

export function filterBooks(books: BookJson[], filter: BookFilter): BookJson[] {
	const q = filter.q?.trim().toLowerCase()
	const owner = filter.owner?.trim()
	const location = filter.location?.trim()
	const author = filter.author?.trim()
	const publisher = filter.publisher?.trim()
	return books.filter(
		(b) =>
			(!owner || b.ownerId === owner) &&
			(!location || b.locationId === location) &&
			(!author || b.authorIds.includes(author)) &&
			(!publisher || b.publisherId === publisher) &&
			(!q || searchText(b).includes(q)),
	)
}
