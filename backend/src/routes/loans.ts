import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { LendSchema } from 'shared/src/book'
import { getDb } from '../db'
import { books, loans } from '../schema'
import { authMiddleware, canEditBook, getAuthUser } from '../util/auth'
import { jsonError } from '../util/http'
import { touchBookUpdatedAt } from './books-types'

export const loanApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const activeOnly = c.req.query('active') === '1'
		const rows = db.select().from(loans).all()
		const filtered = activeOnly ? rows.filter((l) => l.returnedAt === null) : rows
		return c.json({ loans: filtered })
	})
	.post('/books/:id/lend', vValidator('json', LendSchema), async (c) => {
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
		const active = db
			.select()
			.from(loans)
			.where(eq(loans.bookId, bookId))
			.all()
			.find((l) => l.returnedAt === null)
		if (active) {
			return jsonError(c, 'Book is already lent out', 409)
		}
		const id = crypto.randomUUID()
		const lentAt = Date.now()
		db.insert(loans)
			.values({
				id,
				bookId,
				borrowerName: data.borrowerName,
				lentAt,
				dueAt: data.dueAt ? Date.parse(data.dueAt) : null,
				returnedAt: null,
			})
			.run()
		touchBookUpdatedAt(db, bookId, lentAt)
		const [loan] = db.select().from(loans).where(eq(loans.id, id)).all()
		return c.json({ loan }, 201)
	})
	.post('/:id/return', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const [loan] = db
			.select()
			.from(loans)
			.where(eq(loans.id, c.req.param('id')))
			.all()
		if (!loan) {
			return jsonError(c, 'Not found', 404)
		}
		const [book] = db.select().from(books).where(eq(books.id, loan.bookId)).all()
		if (book && !canEditBook(book, me)) {
			return jsonError(c, 'Forbidden: you can only edit your own books', 403)
		}
		db.update(loans).set({ returnedAt: Date.now() }).where(eq(loans.id, loan.id)).run()
		touchBookUpdatedAt(db, loan.bookId)
		return c.json({ ok: true })
	})
