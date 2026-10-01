import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { bookReads, books } from '../schema'
import { authMiddleware, getAuthUser } from '../util/auth'
import { jsonError } from '../util/http'

export const readingApp = new Hono()
	.use('*', authMiddleware)
	// Personal reading list: every logged-in user may mark any visible book as read.
	// This is per-user state, so it neither requires ownership nor bumps the book's updatedAt.
	.put('/books/:id/read', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const bookId = c.req.param('id')
		const [book] = db.select().from(books).where(eq(books.id, bookId)).all()
		if (!book) {
			return jsonError(c, 'Not found', 404)
		}
		db.insert(bookReads)
			.values({ userId: me.id, bookId, readAt: Date.now() })
			.onConflictDoNothing()
			.run()
		const [read] = db
			.select()
			.from(bookReads)
			.where(and(eq(bookReads.userId, me.id), eq(bookReads.bookId, bookId)))
			.all()
		return c.json({ readAt: read?.readAt ?? null })
	})
	.delete('/books/:id/read', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		db.delete(bookReads)
			.where(and(eq(bookReads.userId, me.id), eq(bookReads.bookId, c.req.param('id'))))
			.run()
		return c.json({ readAt: null })
	})
