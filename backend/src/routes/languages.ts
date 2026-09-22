import { vValidator } from '@hono/valibot-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateLanguageSchema, UpdateLanguageSchema } from 'shared/src/book'
import { getDb } from '../db'
import { bookLanguages, languages } from '../schema'
import { authMiddleware } from '../util/auth'
import { jsonError } from '../util/http'

export const languageApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const q = c.req.query('q')?.toLowerCase() ?? ''
		const counts = db
			.select({ languageId: bookLanguages.languageId, count: sql<number>`count(*)` })
			.from(bookLanguages)
			.groupBy(bookLanguages.languageId)
			.all()
		const countById = new Map(counts.map((r) => [r.languageId, Number(r.count)]))
		const rows = db.select().from(languages).all()
		const result = rows
			.filter((l) => !q || l.name.toLowerCase().includes(q))
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((l) => ({ ...l, bookCount: countById.get(l.id) ?? 0 }))
		return c.json({ languages: result })
	})
	.post('/', vValidator('json', CreateLanguageSchema), async (c) => {
		const db = getDb()
		const name = c.req.valid('json').name.trim()
		const existing = db
			.select()
			.from(languages)
			.where(sql`lower(${languages.name}) = lower(${name})`)
			.get()
		if (existing) return jsonError(c, 'Language already exists', 409)
		const id = crypto.randomUUID()
		db.insert(languages).values({ id, name, createdAt: Date.now() }).run()
		return c.json({ language: db.select().from(languages).where(eq(languages.id, id)).get() }, 201)
	})
	.patch('/:id', vValidator('json', UpdateLanguageSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		if (!db.select().from(languages).where(eq(languages.id, id)).get())
			return jsonError(c, 'Not found', 404)
		if (data.name !== undefined) {
			const name = data.name.trim()
			const conflict = db
				.select()
				.from(languages)
				.where(sql`lower(${languages.name}) = lower(${name})`)
				.get()
			if (conflict && conflict.id !== id) return jsonError(c, 'Language already exists', 409)
			db.update(languages).set({ name }).where(eq(languages.id, id)).run()
		}
		return c.json({ language: db.select().from(languages).where(eq(languages.id, id)).get() })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		db.delete(bookLanguages).where(eq(bookLanguages.languageId, id)).run()
		db.delete(languages).where(eq(languages.id, id)).run()
		return c.json({ ok: true })
	})
