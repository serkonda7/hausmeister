import { vValidator } from '@hono/valibot-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreatePublisherSchema, UpdatePublisherSchema } from 'shared/src/book'
import { getDb } from '../db'
import { books, publishers } from '../schema'
import { authMiddleware } from '../util/auth'
import { jsonError } from '../util/http'

export const publisherApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const q = c.req.query('q')?.toLowerCase() ?? ''
		const rows = db.select().from(publishers).all()
		const counts = db
			.select({ publisherId: books.publisherId, count: sql<number>`count(*)` })
			.from(books)
			.groupBy(books.publisherId)
			.all()
		const countById = new Map(
			counts
				.filter((r) => r.publisherId !== null)
				.map((r) => [r.publisherId as string, Number(r.count)]),
		)
		const filtered = rows
			.filter((p) => !q || p.name.toLowerCase().includes(q))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((p) => ({ ...p, bookCount: countById.get(p.id) ?? 0 }))
		return c.json({ publishers: filtered })
	})
	.post('/', vValidator('json', CreatePublisherSchema), async (c) => {
		const db = getDb()
		const data = c.req.valid('json')
		const name = data.name.trim()
		const [existing] = db
			.select()
			.from(publishers)
			.where(sql`lower(${publishers.name}) = lower(${name})`)
			.all()
		if (existing) {
			return jsonError(c, 'Publisher already exists', 409)
		}
		const id = crypto.randomUUID()
		db.insert(publishers).values({ id, name, createdAt: Date.now() }).run()
		const [row] = db.select().from(publishers).where(eq(publishers.id, id)).all()
		return c.json({ publisher: row }, 201)
	})
	.patch('/:id', vValidator('json', UpdatePublisherSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const [existing] = db.select().from(publishers).where(eq(publishers.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		if (data.name !== undefined) {
			const name = data.name.trim()
			const [conflict] = db
				.select()
				.from(publishers)
				.where(sql`lower(${publishers.name}) = lower(${name})`)
				.all()
			if (conflict && conflict.id !== id) {
				return jsonError(c, 'Publisher already exists', 409)
			}
			db.update(publishers).set({ name }).where(eq(publishers.id, id)).run()
		}
		const [row] = db.select().from(publishers).where(eq(publishers.id, id)).all()
		return c.json({ publisher: row })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		db.update(books).set({ publisherId: null }).where(eq(books.publisherId, id)).run()
		db.delete(publishers).where(eq(publishers.id, id)).run()
		return c.json({ ok: true })
	})
