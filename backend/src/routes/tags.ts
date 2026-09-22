import { vValidator } from '@hono/valibot-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateTagSchema, UpdateTagSchema } from 'shared/src/book'
import { getDb } from '../db'
import { bookTags, tags } from '../schema'
import { authMiddleware } from '../util/auth'
import { jsonError } from '../util/http'

export const tagApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const q = c.req.query('q')?.toLowerCase() ?? ''
		const rows = db.select().from(tags).all()
		const counts = db
			.select({ tagId: bookTags.tagId, count: sql<number>`count(*)` })
			.from(bookTags)
			.groupBy(bookTags.tagId)
			.all()
		const countById = new Map(counts.map((r) => [r.tagId, Number(r.count)]))
		const filtered = rows
			.filter((t) => !q || t.name.toLowerCase().includes(q))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((t) => ({ ...t, bookCount: countById.get(t.id) ?? 0 }))
		return c.json({ tags: filtered })
	})
	.post('/', vValidator('json', CreateTagSchema), async (c) => {
		const db = getDb()
		const data = c.req.valid('json')
		const name = data.name.trim()
		const [existing] = db.select().from(tags).where(sql`lower(${tags.name}) = lower(${name})`).all()
		if (existing) {
			return jsonError(c, 'Tag already exists', 409)
		}
		const id = crypto.randomUUID()
		db.insert(tags).values({ id, name, createdAt: Date.now() }).run()
		const [row] = db.select().from(tags).where(eq(tags.id, id)).all()
		return c.json({ tag: row }, 201)
	})
	.patch('/:id', vValidator('json', UpdateTagSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const [existing] = db.select().from(tags).where(eq(tags.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		if (data.name !== undefined) {
			const name = data.name.trim()
			const [conflict] = db
				.select()
				.from(tags)
				.where(sql`lower(${tags.name}) = lower(${name})`)
				.all()
			if (conflict && conflict.id !== id) {
				return jsonError(c, 'Tag already exists', 409)
			}
			db.update(tags).set({ name }).where(eq(tags.id, id)).run()
		}
		const [row] = db.select().from(tags).where(eq(tags.id, id)).all()
		return c.json({ tag: row })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		db.delete(bookTags).where(eq(bookTags.tagId, id)).run()
		db.delete(tags).where(eq(tags.id, id)).run()
		return c.json({ ok: true })
	})
