import { vValidator } from '@hono/valibot-validator'
import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { LendSchema } from 'shared/src/book'
import { getDb } from '../db'
import { loans } from '../schema'
import { type AppEnv, currentUser } from '../util/auth'
import { requireEditableBook, touchBook } from '../util/books'
import { fail } from '../util/http'

export const loanApp = new Hono<AppEnv>()
	.get('/loans', (c) => {
		const activeOnly = c.req.query('active') === '1'
		const rows = getDb()
			.select()
			.from(loans)
			.where(activeOnly ? isNull(loans.returnedAt) : undefined)
			.all()
		return c.json({ loans: rows })
	})
	.post('/books/:id/lend', vValidator('json', LendSchema), (c) => {
		const db = getDb()
		const bookId = requireEditableBook(db, c.req.param('id'), currentUser(c)).id
		const active = db
			.select()
			.from(loans)
			.where(and(eq(loans.bookId, bookId), isNull(loans.returnedAt)))
			.get()
		if (active) fail(409, 'Book is already lent out')
		const data = c.req.valid('json')
		const loan = {
			id: crypto.randomUUID(),
			bookId,
			borrowerName: data.borrowerName,
			lentAt: Date.now(),
			dueAt: data.dueAt ? Date.parse(data.dueAt) : null,
			returnedAt: null,
		}
		db.insert(loans).values(loan).run()
		touchBook(db, bookId, loan.lentAt)
		return c.json({ loan }, 201)
	})
	.post('/loans/:id/return', (c) => {
		const db = getDb()
		const loan =
			db
				.select()
				.from(loans)
				.where(eq(loans.id, c.req.param('id')))
				.get() ?? fail(404, 'Not found')
		requireEditableBook(db, loan.bookId, currentUser(c))
		db.update(loans).set({ returnedAt: Date.now() }).where(eq(loans.id, loan.id)).run()
		touchBook(db, loan.bookId)
		return c.json({ ok: true })
	})
