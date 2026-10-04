import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateBookSchema, type PublicUser, UpdateBookSchema } from 'shared/src/book'
import type * as v from 'valibot'
import { type Db, getDb } from '../db'
import {
	authors,
	bookAuthors,
	bookLanguages,
	books,
	bookTags,
	languages,
	locations,
	publishers,
	tags,
	users,
} from '../schema'
import { type AppEnv, currentUser } from '../util/auth'
import { assertCanEditBook, findBook, requireBook, requireEditableBook } from '../util/books'
import { fail } from '../util/http'
import { ensureIdsExist } from '../util/query'
import { filterBooks, serializeBook, serializeBooks } from './books-serialize'

type BookInput = v.InferOutput<typeof UpdateBookSchema>

function validateReferences(db: Db, data: BookInput): void {
	if (data.authorIds) ensureIdsExist(db, authors.id, data.authorIds, 'author')
	if (data.tagIds) ensureIdsExist(db, tags.id, data.tagIds, 'tag')
	if (data.languageIds) ensureIdsExist(db, languages.id, data.languageIds, 'language')
	if (data.publisherId) ensureIdsExist(db, publishers.id, [data.publisherId], 'publisher')
	if (data.locationId) ensureIdsExist(db, locations.id, [data.locationId], 'location')
}

/** Only admins may assign an owner other than `current` (the creator for new books). */
function resolveOwner(
	db: Db,
	me: PublicUser,
	requested: string | null | undefined,
	current: string | null,
): string | null {
	if (requested === undefined || requested === current) return current
	if (!me.isAdmin) fail(403, 'Only admins can change the owner')
	if (requested !== null) ensureIdsExist(db, users.id, [requested], 'owner')
	return requested
}

/** Replace the link rows of every relation present in `data`. */
function writeLinks(db: Db, bookId: string, data: BookInput): void {
	const unique = (ids: string[]) => [...new Set(ids)]
	if (data.authorIds) {
		db.delete(bookAuthors).where(eq(bookAuthors.bookId, bookId)).run()
		for (const authorId of unique(data.authorIds)) {
			db.insert(bookAuthors).values({ bookId, authorId }).run()
		}
	}
	if (data.tagIds) {
		db.delete(bookTags).where(eq(bookTags.bookId, bookId)).run()
		for (const tagId of unique(data.tagIds)) db.insert(bookTags).values({ bookId, tagId }).run()
	}
	if (data.languageIds) {
		db.delete(bookLanguages).where(eq(bookLanguages.bookId, bookId)).run()
		for (const languageId of unique(data.languageIds)) {
			db.insert(bookLanguages).values({ bookId, languageId }).run()
		}
	}
}

export const bookApp = new Hono<AppEnv>()
	.get('/', (c) => {
		const db = getDb()
		const all = serializeBooks(db, db.select().from(books).all(), currentUser(c).id)
		const filtered = filterBooks(all, {
			q: c.req.query('q'),
			owner: c.req.query('owner'),
			location: c.req.query('location'),
			author: c.req.query('author'),
			publisher: c.req.query('publisher'),
		})
		return c.json({ books: filtered })
	})
	.post('/', vValidator('json', CreateBookSchema), (c) => {
		const db = getDb()
		const me = currentUser(c)
		const { authorIds, tagIds, languageIds, ownerId, ...fields } = c.req.valid('json')
		validateReferences(db, { authorIds, tagIds, languageIds, ...fields })
		const owner = resolveOwner(db, me, ownerId, me.id)
		const id = crypto.randomUUID()
		const now = Date.now()
		db.transaction((tx) => {
			tx.insert(books)
				.values({ ...fields, id, ownerId: owner, createdAt: now, updatedAt: now })
				.run()
			writeLinks(tx, id, { authorIds, tagIds, languageIds })
		})
		return c.json({ book: serializeBook(db, requireBook(db, id), me.id) }, 201)
	})
	.get('/:id', (c) => {
		const db = getDb()
		return c.json({
			book: serializeBook(db, requireBook(db, c.req.param('id')), currentUser(c).id),
		})
	})
	.patch('/:id', vValidator('json', UpdateBookSchema), (c) => {
		const db = getDb()
		const me = currentUser(c)
		const existing = requireEditableBook(db, c.req.param('id'), me)
		const { authorIds, tagIds, languageIds, ownerId, ...fields } = c.req.valid('json')
		validateReferences(db, { authorIds, tagIds, languageIds, ...fields })
		const owner = resolveOwner(db, me, ownerId, existing.ownerId)
		db.transaction((tx) => {
			// Drizzle skips undefined values, so omitted fields keep their current value.
			tx.update(books)
				.set({ ...fields, ownerId: owner, updatedAt: Date.now() })
				.where(eq(books.id, existing.id))
				.run()
			writeLinks(tx, existing.id, { authorIds, tagIds, languageIds })
		})
		return c.json({ book: serializeBook(db, requireBook(db, existing.id), me.id) })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const existing = findBook(db, c.req.param('id'))
		if (existing) {
			assertCanEditBook(existing, currentUser(c), 'delete')
			// Links, reads, loans and provenance cascade.
			db.delete(books).where(eq(books.id, existing.id)).run()
		}
		return c.json({ ok: true })
	})
