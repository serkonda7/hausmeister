import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { UpdateReadingSchema } from 'shared/src/book'
import { getDb } from '../db'
import { books, readingState } from '../schema'
import { authMiddleware, canEditBook, getAuthUser } from '../util/auth'
import { jsonError } from '../util/http'

export const readingApp = new Hono().patch(
	'/books/:id/reading',
	authMiddleware,
	vValidator('json', UpdateReadingSchema),
	async (c) => {
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
		if (!canEditBook(book, me)) {
			return jsonError(c, 'Forbidden: you can only edit your own books', 403)
		}
		const data = c.req.valid('json')
		const now = Date.now()
		db.insert(readingState)
			.values({ bookId, status: data.status ?? 'want' })
			.onConflictDoNothing()
			.run()
		db.update(readingState)
			.set({
				status: data.status,
				progressPages: data.progressPages,
				rating: data.rating,
				notes: data.notes,
				finishedAt: data.status === 'finished' ? now : undefined,
				startedAt: data.status === 'reading' ? now : undefined,
			})
			.where(eq(readingState.bookId, bookId))
			.run()
		const [reading] = db.select().from(readingState).where(eq(readingState.bookId, bookId)).all()
		return c.json({ reading })
	},
)
