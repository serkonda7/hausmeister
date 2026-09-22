import { vValidator } from '@hono/valibot-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateAuthorSchema, UpdateAuthorSchema } from 'shared/src/book'
import { getDb } from '../db'
import { authors, bookAuthors } from '../schema'
import { authMiddleware } from '../util/auth'
import { jsonError } from '../util/http'

export const authorApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const q = c.req.query('q')?.toLowerCase() ?? ''
		const rows = db.select().from(authors).all()
		const counts = db
			.select({ authorId: bookAuthors.authorId, count: sql<number>`count(*)` })
			.from(bookAuthors)
			.groupBy(bookAuthors.authorId)
			.all()
		const countById = new Map(counts.map((r) => [r.authorId, Number(r.count)]))
		const filtered = rows
			.filter((a) => !q || a.name.toLowerCase().includes(q))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((a) => ({ ...a, bookCount: countById.get(a.id) ?? 0 }))
		return c.json({ authors: filtered })
	})
	.post('/', vValidator('json', CreateAuthorSchema), async (c) => {
		const db = getDb()
		const data = c.req.valid('json')
		const name = data.name.trim()
		const [existing] = db
			.select()
			.from(authors)
			.where(sql`lower(${authors.name}) = lower(${name})`)
			.all()
		if (existing) {
			return jsonError(c, 'Author already exists', 409)
		}
		const id = crypto.randomUUID()
		db.insert(authors).values({ id, name, createdAt: Date.now() }).run()
		const [row] = db.select().from(authors).where(eq(authors.id, id)).all()
		return c.json({ author: row }, 201)
	})
	.patch('/:id', vValidator('json', UpdateAuthorSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const [existing] = db.select().from(authors).where(eq(authors.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		if (data.name !== undefined) {
			const name = data.name.trim()
			const [conflict] = db
				.select()
				.from(authors)
				.where(sql`lower(${authors.name}) = lower(${name})`)
				.all()
			if (conflict && conflict.id !== id) {
				return jsonError(c, 'Author already exists', 409)
			}
			db.update(authors).set({ name }).where(eq(authors.id, id)).run()
		}
		const [row] = db.select().from(authors).where(eq(authors.id, id)).all()
		return c.json({ author: row })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		db.delete(bookAuthors).where(eq(bookAuthors.authorId, id)).run()
		db.delete(authors).where(eq(authors.id, id)).run()
		return c.json({ ok: true })
	})
