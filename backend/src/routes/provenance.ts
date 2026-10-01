import { vValidator } from '@hono/valibot-validator'
import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import {
	CreateProvenanceEventSchema,
	ownershipOf,
	UpdateProvenanceEventSchema,
} from 'shared/src/book'
import { type Db, getDb } from '../db'
import { provenanceEvents } from '../schema'
import { type AppEnv, currentUser } from '../util/auth'
import { requireBook, requireEditableBook, touchBook } from '../util/books'
import { fail } from '../util/http'
import { groupBy } from '../util/query'

type ProvenanceEvent = typeof provenanceEvents.$inferSelect

function byOccurrence(a: ProvenanceEvent, b: ProvenanceEvent): number {
	return (a.occurredAt ?? a.createdAt) - (b.occurredAt ?? b.createdAt)
}

/** Each book's provenance events in chronological order. */
export function provenanceByBook(db: Db, bookIds: string[]): Map<string, ProvenanceEvent[]> {
	const rows = db
		.select()
		.from(provenanceEvents)
		.where(inArray(provenanceEvents.bookId, bookIds))
		.all()
		.sort(byOccurrence)
	return groupBy(rows, (e) => e.bookId)
}

/** Empty input clears the date; anything unparsable is rejected. */
function parseOccurredAt(input: string | undefined): number | null {
	if (!input) return null
	const parsed = Date.parse(input)
	return Number.isNaN(parsed) ? fail(400, 'Invalid occurredAt date') : parsed
}

function findEvent(db: Db, id: string): ProvenanceEvent | undefined {
	return db.select().from(provenanceEvents).where(eq(provenanceEvents.id, id)).get()
}

function bookEvents(db: Db, bookId: string): ProvenanceEvent[] {
	requireBook(db, bookId)
	return provenanceByBook(db, [bookId]).get(bookId) ?? []
}

export const provenanceApp = new Hono<AppEnv>()
	.get('/books/:id/provenance', (c) => {
		return c.json({ events: bookEvents(getDb(), c.req.param('id')) })
	})
	.get('/books/:id/provenance/summary', (c) => {
		const events = bookEvents(getDb(), c.req.param('id'))
		return c.json({
			ownership: ownershipOf(events),
			count: events.length,
			lastEvent: events.at(-1) ?? null,
		})
	})
	.post('/books/:id/provenance', vValidator('json', CreateProvenanceEventSchema), (c) => {
		const db = getDb()
		const bookId = requireEditableBook(db, c.req.param('id'), currentUser(c)).id
		const data = c.req.valid('json')
		const event = {
			id: crypto.randomUUID(),
			bookId,
			kind: data.kind,
			occurredAt: parseOccurredAt(data.occurredAt),
			party: data.party || null,
			priceCents: data.priceCents ?? null,
			createdAt: Date.now(),
		}
		db.insert(provenanceEvents).values(event).run()
		touchBook(db, bookId, event.createdAt)
		return c.json({ event }, 201)
	})
	.patch('/provenance/:id', vValidator('json', UpdateProvenanceEventSchema), (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const existing = findEvent(db, id) ?? fail(404, 'Not found')
		requireEditableBook(db, existing.bookId, currentUser(c))
		db.update(provenanceEvents)
			.set({
				kind: data.kind,
				occurredAt: data.occurredAt === undefined ? undefined : parseOccurredAt(data.occurredAt),
				party: data.party === undefined ? undefined : data.party || null,
				priceCents: data.priceCents,
			})
			.where(eq(provenanceEvents.id, id))
			.run()
		touchBook(db, existing.bookId)
		return c.json({ event: findEvent(db, id) })
	})
	.delete('/provenance/:id', (c) => {
		const db = getDb()
		const existing = findEvent(db, c.req.param('id'))
		if (existing) {
			requireEditableBook(db, existing.bookId, currentUser(c))
			db.delete(provenanceEvents).where(eq(provenanceEvents.id, existing.id)).run()
			touchBook(db, existing.bookId)
		}
		return c.json({ ok: true })
	})
