import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateBookSchema, UpdateBookSchema } from 'shared/src/book'
import { getDb } from '../db'
import {
	bookAuthors,
	bookLanguages,
	bookReads,
	books,
	bookTags,
	provenanceEvents,
	users,
} from '../schema'
import { authMiddleware, canEditBook, getAuthUser } from '../util/auth'
import { jsonError } from '../util/http'
import { normalizePageNotes } from '../util/page-notes'
import { toBookListJson, toSingleBookJson } from './books-enrichment'
import { filterBooks } from './books-search'
import { now } from './books-types'
import {
	ensureAuthorsExist,
	ensureLanguagesExist,
	ensureLocationExists,
	ensurePublisherExists,
	ensureTagsExist,
} from './books-validation'

export const bookApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const rows = db.select().from(books).all()
		const enriched = toBookListJson(db, rows, me.id)
		const filtered = filterBooks(enriched, {
			q: c.req.query('q'),
			owner: c.req.query('owner'),
			location: c.req.query('location'),
		})
		return c.json({ books: filtered })
	})
	.post('/', vValidator('json', CreateBookSchema), async (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const data = c.req.valid('json')
		const authorIds = [...new Set(data.authorIds ?? [])]
		const authorError = ensureAuthorsExist(db, authorIds)
		if (authorError) {
			return jsonError(c, authorError, 400)
		}
		const tagIds = [...new Set(data.tagIds ?? [])]
		const tagError = ensureTagsExist(db, tagIds)
		if (tagError) {
			return jsonError(c, tagError, 400)
		}
		const languageIds = [...new Set(data.languageIds ?? [])]
		const languageError = ensureLanguagesExist(db, languageIds)
		if (languageError) return jsonError(c, languageError, 400)
		if (data.publisherId != null) {
			const publisherError = ensurePublisherExists(db, data.publisherId)
			if (publisherError) {
				return jsonError(c, publisherError, 400)
			}
		}
		let locationId: string | null = null
		if (data.locationId !== undefined && data.locationId !== null) {
			const locationError = ensureLocationExists(db, data.locationId)
			if (locationError) {
				return jsonError(c, locationError, 400)
			}
			locationId = data.locationId
		}
		// Owner: new books belong to the creator. Only admins may assign another owner.
		let ownerId: string | null = me.id
		if (data.ownerId !== undefined && data.ownerId !== null) {
			if (!me.isAdmin) {
				if (data.ownerId !== me.id) {
					return jsonError(c, 'Only admins can assign another owner', 403)
				}
				ownerId = me.id
			} else {
				const [owner] = db.select().from(users).where(eq(users.id, data.ownerId)).all()
				if (!owner) {
					return jsonError(c, 'Unknown owner id', 400)
				}
				ownerId = data.ownerId
			}
		} else if (data.ownerId === null && me.isAdmin) {
			ownerId = null
		}
		const id = crypto.randomUUID()
		const timestamp = now()
		db.insert(books)
			.values({
				id,
				isbn: data.isbn ?? null,
				title: data.title,
				subtitle: data.subtitle ?? null,
				publisherId: data.publisherId ?? null,
				ownerId,
				locationId,
				printYear: data.printYear ?? null,
				coverUrl: data.coverUrl ?? null,
				pages: data.pages ?? null,
				description: data.description ?? null,
				dedications: normalizePageNotes(data.dedications),
				damages: normalizePageNotes(data.damages),
				createdAt: timestamp,
				updatedAt: timestamp,
			})
			.run()
		for (const authorId of authorIds) {
			db.insert(bookAuthors).values({ bookId: id, authorId }).run()
		}
		for (const tagId of tagIds) {
			db.insert(bookTags).values({ bookId: id, tagId }).run()
		}
		for (const languageId of languageIds)
			db.insert(bookLanguages).values({ bookId: id, languageId }).run()
		const [row] = db.select().from(books).where(eq(books.id, id)).all()
		return c.json({ book: toSingleBookJson(db, row, me.id) }, 201)
	})
	.get('/:id', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const [row] = db
			.select()
			.from(books)
			.where(eq(books.id, c.req.param('id')))
			.all()
		if (!row) {
			return jsonError(c, 'Not found', 404)
		}
		return c.json({ book: toSingleBookJson(db, row, me.id) })
	})
	.patch('/:id', vValidator('json', UpdateBookSchema), async (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const [existing] = db.select().from(books).where(eq(books.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		if (!canEditBook(existing, me)) {
			return jsonError(c, 'Forbidden: you can only edit your own books', 403)
		}
		if (data.authorIds !== undefined) {
			const authorError = ensureAuthorsExist(db, data.authorIds)
			if (authorError) {
				return jsonError(c, authorError, 400)
			}
		}
		if (data.tagIds !== undefined) {
			const tagError = ensureTagsExist(db, data.tagIds)
			if (tagError) {
				return jsonError(c, tagError, 400)
			}
		}
		if (data.languageIds !== undefined) {
			const languageError = ensureLanguagesExist(db, data.languageIds)
			if (languageError) return jsonError(c, languageError, 400)
			db.delete(bookLanguages).where(eq(bookLanguages.bookId, id)).run()
			for (const languageId of [...new Set(data.languageIds)])
				db.insert(bookLanguages).values({ bookId: id, languageId }).run()
		}
		if (data.publisherId !== undefined && data.publisherId !== null) {
			const publisherError = ensurePublisherExists(db, data.publisherId)
			if (publisherError) {
				return jsonError(c, publisherError, 400)
			}
		}
		if (data.locationId !== undefined && data.locationId !== null) {
			const locationError = ensureLocationExists(db, data.locationId)
			if (locationError) {
				return jsonError(c, locationError, 400)
			}
		}
		// Only admins may transfer ownership.
		let nextOwnerId = existing.ownerId
		if (data.ownerId !== undefined) {
			if (!me.isAdmin) {
				if (data.ownerId !== existing.ownerId && data.ownerId !== me.id) {
					return jsonError(c, 'Only admins can change the owner', 403)
				}
				nextOwnerId = existing.ownerId
			} else if (data.ownerId === null) {
				nextOwnerId = null
			} else {
				const [owner] = db.select().from(users).where(eq(users.id, data.ownerId)).all()
				if (!owner) {
					return jsonError(c, 'Unknown owner id', 400)
				}
				nextOwnerId = data.ownerId
			}
		}
		let nextLocationId = existing.locationId
		if (data.locationId !== undefined) {
			nextLocationId = data.locationId
		}
		const existingLanguages = (existing.languages as string[] | null) ?? []
		const nextLanguages = data.languages ?? existingLanguages
		db.update(books)
			.set({
				isbn: data.isbn ?? existing.isbn,
				title: data.title ?? existing.title,
				subtitle: data.subtitle === undefined ? existing.subtitle : data.subtitle,
				publisherId: data.publisherId === undefined ? existing.publisherId : data.publisherId,
				ownerId: nextOwnerId,
				locationId: nextLocationId,
				printYear: data.printYear ?? existing.printYear,
				languages: nextLanguages,
				coverUrl: data.coverUrl ?? existing.coverUrl,
				pages: data.pages ?? existing.pages,
				description: data.description ?? existing.description,
				dedications:
					data.dedications === undefined
						? normalizePageNotes(existing.dedications)
						: normalizePageNotes(data.dedications),
				damages:
					data.damages === undefined
						? normalizePageNotes(existing.damages)
						: normalizePageNotes(data.damages),
				updatedAt: now(),
			})
			.where(eq(books.id, id))
			.run()
		if (data.authorIds !== undefined) {
			const next = [...new Set(data.authorIds)]
			db.delete(bookAuthors).where(eq(bookAuthors.bookId, id)).run()
			for (const authorId of next) {
				db.insert(bookAuthors).values({ bookId: id, authorId }).run()
			}
		}
		if (data.tagIds !== undefined) {
			const nextTags = [...new Set(data.tagIds)]
			db.delete(bookTags).where(eq(bookTags.bookId, id)).run()
			for (const tagId of nextTags) {
				db.insert(bookTags).values({ bookId: id, tagId }).run()
			}
		}
		const [row] = db.select().from(books).where(eq(books.id, id)).all()
		return c.json({ book: toSingleBookJson(db, row, me.id) })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const id = c.req.param('id')
		const [existing] = db.select().from(books).where(eq(books.id, id)).all()
		if (!existing) {
			return c.json({ ok: true })
		}
		if (!canEditBook(existing, me)) {
			return jsonError(c, 'Forbidden: you can only delete your own books', 403)
		}
		db.delete(bookAuthors).where(eq(bookAuthors.bookId, id)).run()
		db.delete(bookTags).where(eq(bookTags.bookId, id)).run()
		db.delete(bookReads).where(eq(bookReads.bookId, id)).run()
		db.delete(provenanceEvents).where(eq(provenanceEvents.bookId, id)).run()
		db.delete(books).where(eq(books.id, id)).run()
		return c.json({ ok: true })
	})
