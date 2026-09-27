import { vValidator } from '@hono/valibot-validator'
import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateProvenanceEventSchema, UpdateProvenanceEventSchema } from 'shared/src/book'
import { getDb } from '../db'
import { books, provenanceEvents } from '../schema'
import { authMiddleware, canEditBook, getAuthUser } from '../util/auth'
import { jsonError } from '../util/http'
import { touchBookUpdatedAt } from './books-types'

function parseOccurredAt(input: string | undefined): number | null | 'invalid' {
	if (input === undefined) {
		return null
	}
	const trimmed = input.trim()
	if (!trimmed) {
		return null
	}
	const parsed = Date.parse(trimmed)
	if (Number.isNaN(parsed)) {
		return 'invalid'
	}
	return parsed
}

function toEventJson(row: typeof provenanceEvents.$inferSelect) {
	return { ...row }
}

export const provenanceApp = new Hono()
	.use('*', authMiddleware)
	.get('/books/:id/provenance', (c) => {
		const db = getDb()
		const bookId = c.req.param('id')
		const [book] = db.select().from(books).where(eq(books.id, bookId)).all()
		if (!book) {
			return jsonError(c, 'Not found', 404)
		}
		const rows = db.select().from(provenanceEvents).where(eq(provenanceEvents.bookId, bookId)).all()
		rows.sort((a, b) => (a.occurredAt ?? a.createdAt) - (b.occurredAt ?? b.createdAt))
		return c.json({ events: rows.map(toEventJson) })
	})
	.post('/books/:id/provenance', vValidator('json', CreateProvenanceEventSchema), async (c) => {
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
		const occurredAt = parseOccurredAt(data.occurredAt)
		if (occurredAt === 'invalid') {
			return jsonError(c, 'Invalid occurredAt date', 400)
		}
		const id = crypto.randomUUID()
		const now = Date.now()
		db.insert(provenanceEvents)
			.values({
				id,
				bookId,
				kind: data.kind,
				occurredAt,
				party: data.party?.trim() ? data.party.trim() : null,
				priceCents: data.priceCents ?? null,
				createdAt: now,
			})
			.run()
		touchBookUpdatedAt(db, bookId, now)
		const [row] = db.select().from(provenanceEvents).where(eq(provenanceEvents.id, id)).all()
		return c.json({ event: toEventJson(row) }, 201)
	})
	.patch('/provenance/:id', vValidator('json', UpdateProvenanceEventSchema), async (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const [existing] = db.select().from(provenanceEvents).where(eq(provenanceEvents.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		const [book] = db.select().from(books).where(eq(books.id, existing.bookId)).all()
		if (book && !canEditBook(book, me)) {
			return jsonError(c, 'Forbidden: you can only edit your own books', 403)
		}
		let occurredAt = existing.occurredAt
		if (data.occurredAt !== undefined) {
			const parsed = parseOccurredAt(data.occurredAt)
			if (parsed === 'invalid') {
				return jsonError(c, 'Invalid occurredAt date', 400)
			}
			occurredAt = parsed
		}
		db.update(provenanceEvents)
			.set({
				kind: data.kind ?? existing.kind,
				occurredAt,
				party:
					data.party === undefined ? existing.party : data.party.trim() ? data.party.trim() : null,
				priceCents: data.priceCents === undefined ? existing.priceCents : (data.priceCents ?? null),
			})
			.where(eq(provenanceEvents.id, id))
			.run()
		touchBookUpdatedAt(db, existing.bookId)
		const [row] = db.select().from(provenanceEvents).where(eq(provenanceEvents.id, id)).all()
		return c.json({ event: toEventJson(row) })
	})
	.delete('/provenance/:id', (c) => {
		const db = getDb()
		const me = getAuthUser(c)
		if (!me) {
			return jsonError(c, 'Unauthorized', 401)
		}
		const id = c.req.param('id')
		const [existing] = db.select().from(provenanceEvents).where(eq(provenanceEvents.id, id)).all()
		if (existing) {
			const [book] = db.select().from(books).where(eq(books.id, existing.bookId)).all()
			if (book && !canEditBook(book, me)) {
				return jsonError(c, 'Forbidden: you can only edit your own books', 403)
			}
		}
		db.delete(provenanceEvents).where(eq(provenanceEvents.id, id)).run()
		if (existing) {
			touchBookUpdatedAt(db, existing.bookId)
		}
		return c.json({ ok: true })
	})
	.get('/books/:id/provenance/summary', (c) => {
		const db = getDb()
		const bookId = c.req.param('id')
		const [book] = db.select().from(books).where(eq(books.id, bookId)).all()
		if (!book) {
			return jsonError(c, 'Not found', 404)
		}
		const rows = db.select().from(provenanceEvents).where(eq(provenanceEvents.bookId, bookId)).all()
		rows.sort((a, b) => (a.occurredAt ?? a.createdAt) - (b.occurredAt ?? b.createdAt))
		const last = rows[rows.length - 1]
		const ownership = !last ? 'unknown' : last.kind === 'sell' ? 'disposed' : 'owned'
		return c.json({ ownership, count: rows.length, lastEvent: last ? toEventJson(last) : null })
	})

export function provenanceMap(
	db: ReturnType<typeof getDb>,
	bookIds: string[],
): Map<string, Array<typeof provenanceEvents.$inferSelect>> {
	const map = new Map<string, Array<typeof provenanceEvents.$inferSelect>>()
	if (bookIds.length === 0) {
		return map
	}
	const rows = db
		.select()
		.from(provenanceEvents)
		.where(inArray(provenanceEvents.bookId, bookIds))
		.all()
	for (const row of rows) {
		const list = map.get(row.bookId) ?? []
		list.push(row)
		map.set(row.bookId, list)
	}
	for (const list of map.values()) {
		list.sort((a, b) => (a.occurredAt ?? a.createdAt) - (b.occurredAt ?? b.createdAt))
	}
	return map
}

export function ownershipOf(events: Array<{ kind: string }>): 'owned' | 'disposed' | 'unknown' {
	if (events.length === 0) {
		return 'unknown'
	}
	const last = events[events.length - 1].kind
	return last === 'sell' ? 'disposed' : 'owned'
}
