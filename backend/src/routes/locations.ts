import { vValidator } from '@hono/valibot-validator'
import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateLocationSchema, UpdateLocationSchema } from 'shared/src/book'
import { type Db, getDb } from '../db'
import { books, locations } from '../schema'
import type { AppEnv } from '../util/auth'
import { fail } from '../util/http'

type LocationRow = typeof locations.$inferSelect

export type LocationPath = LocationRow & {
	path: Array<{ id: string; name: string }>
	fullPath: string
	depth: number
}

/** Every location with its ancestor path (root first). */
export function locationPaths(db: Db): Map<string, LocationPath> {
	const byId = new Map(
		db
			.select()
			.from(locations)
			.all()
			.map((r) => [r.id, r]),
	)
	const result = new Map<string, LocationPath>()
	for (const row of byId.values()) {
		const path: LocationRow[] = []
		// Walk up; the seen-check guards against corrupt cycles.
		for (let cur: LocationRow | undefined = row; cur && !path.includes(cur); ) {
			path.unshift(cur)
			cur = cur.parentId ? byId.get(cur.parentId) : undefined
		}
		result.set(row.id, {
			...row,
			path: path.map(({ id, name }) => ({ id, name })),
			fullPath: path.map((p) => p.name).join(' / '),
			depth: path.length - 1,
		})
	}
	return result
}

function listLocations(db: Db) {
	const bookCounts = db
		.select({ id: books.locationId, count: count() })
		.from(books)
		.groupBy(books.locationId)
		.all()
	const bookCountById = new Map(bookCounts.map((r) => [r.id, r.count]))
	const all = [...locationPaths(db).values()]
	return all.map((l) => ({
		...l,
		bookCount: bookCountById.get(l.id) ?? 0,
		childrenCount: all.filter((child) => child.parentId === l.id).length,
	}))
}

function requireLocation(db: Db, id: string): LocationRow {
	return db.select().from(locations).where(eq(locations.id, id)).get() ?? fail(404, 'Not found')
}

function assertNameFreeAmongSiblings(
	db: Db,
	name: string,
	parentId: string | null,
	ownId?: string,
): void {
	const taken = db
		.select()
		.from(locations)
		.all()
		.some(
			(r) =>
				r.id !== ownId && r.parentId === parentId && r.name.toLowerCase() === name.toLowerCase(),
		)
	if (taken) fail(409, 'A location with this name already exists here')
}

function locationJson(db: Db, id: string) {
	return listLocations(db).find((l) => l.id === id)
}

export const locationApp = new Hono<AppEnv>()
	.get('/', (c) => {
		const q = c.req.query('q')?.toLowerCase() ?? ''
		const matching = listLocations(getDb())
			.filter((l) => l.name.toLowerCase().includes(q) || l.fullPath.toLowerCase().includes(q))
			.sort((a, b) => a.fullPath.localeCompare(b.fullPath))
		return c.json({ locations: matching })
	})
	.post('/', vValidator('json', CreateLocationSchema), (c) => {
		const db = getDb()
		const { name, parentId = null } = c.req.valid('json')
		if (parentId !== null && !locationPaths(db).has(parentId)) fail(400, 'Unknown parent id')
		assertNameFreeAmongSiblings(db, name, parentId)
		const id = crypto.randomUUID()
		db.insert(locations).values({ id, name, parentId, createdAt: Date.now() }).run()
		return c.json({ location: locationJson(db, id) }, 201)
	})
	.patch('/:id', vValidator('json', UpdateLocationSchema), (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const existing = requireLocation(db, id)
		const name = data.name ?? existing.name
		const parentId = data.parentId === undefined ? existing.parentId : data.parentId
		if (parentId === id) fail(400, 'A location cannot be its own parent')
		if (parentId !== null && data.parentId !== undefined) {
			const parent = locationPaths(db).get(parentId) ?? fail(400, 'Unknown parent id')
			if (parent.path.some((p) => p.id === id)) {
				fail(400, 'Cannot move a location into its own subtree')
			}
		}
		assertNameFreeAmongSiblings(db, name, parentId, id)
		db.update(locations).set({ name, parentId }).where(eq(locations.id, id)).run()
		return c.json({ location: locationJson(db, id) })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const existing = db.select().from(locations).where(eq(locations.id, id)).get()
		if (!existing) return c.json({ ok: true })
		// Reparent children to the deleted location's parent (or root).
		// Refuse when that would create duplicate sibling names; the user can rename first.
		const all = db.select().from(locations).all()
		const taken = new Set(
			all
				.filter((r) => r.parentId === existing.parentId && r.id !== id)
				.map((r) => r.name.toLowerCase()),
		)
		for (const child of all.filter((r) => r.parentId === id)) {
			const key = child.name.toLowerCase()
			if (taken.has(key)) {
				fail(409, `Cannot delete: sub-location "${child.name}" already exists here`)
			}
			taken.add(key)
		}
		db.update(locations)
			.set({ parentId: existing.parentId })
			.where(eq(locations.parentId, id))
			.run()
		// Books in the deleted location become unlocated (ON DELETE SET NULL).
		db.delete(locations).where(eq(locations.id, id)).run()
		return c.json({ ok: true })
	})
