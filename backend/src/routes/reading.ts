import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { bookReads } from '../schema'
import { type AppEnv, currentUser } from '../util/auth'
import { requireBook } from '../util/books'

// Personal reading list: every logged-in user may mark any visible book as read.
// This is per-user state, so it neither requires ownership nor bumps the book's updatedAt.
export const readingApp = new Hono<AppEnv>()
	.put('/books/:id/read', (c) => {
		const db = getDb()
		const userId = currentUser(c).id
		const bookId = requireBook(db, c.req.param('id')).id
		db.insert(bookReads).values({ userId, bookId, readAt: Date.now() }).onConflictDoNothing().run()
		const read = db
			.select()
			.from(bookReads)
			.where(and(eq(bookReads.userId, userId), eq(bookReads.bookId, bookId)))
			.get()
		return c.json({ readAt: read?.readAt ?? null })
	})
	.delete('/books/:id/read', (c) => {
		const userId = currentUser(c).id
		getDb()
			.delete(bookReads)
			.where(and(eq(bookReads.userId, userId), eq(bookReads.bookId, c.req.param('id'))))
			.run()
		return c.json({ readAt: null })
	})
