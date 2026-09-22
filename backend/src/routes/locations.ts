import { vValidator } from '@hono/valibot-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateLocationSchema, UpdateLocationSchema } from 'shared/src/book'
import { getDb } from '../db'
import { books, locations } from '../schema'
import { authMiddleware } from '../util/auth'
import { jsonError } from '../util/http'
import {
	buildLocationPath,
	isDescendant,
	locationFullPath,
	locationMaps,
	siblingNameTaken,
} from './locations-tree'

export type { LocationRow } from './locations-tree'
// Re-export tree helpers so existing `from './locations'` imports keep working.
// New code should import from './locations-tree' directly.
export {
	buildLocationPath,
	isDescendant,
	locationFullPath,
	locationMap,
	locationMaps,
	locationPathStrings,
	siblingNameTaken,
} from './locations-tree'

type LocationRow = typeof locations.$inferSelect

export type LocationJson = LocationRow & {
	bookCount: number
	childrenCount: number
	path: Array<{ id: string; name: string }>
	fullPath: string
	depth: number
}

export const locationApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const db = getDb()
		const q = c.req.query('q')?.toLowerCase() ?? ''
		const { byId } = locationMaps(db)
		const rows = [...byId.values()]
		const bookCounts = db
			.select({ locationId: books.locationId, count: sql<number>`count(*)` })
			.from(books)
			.groupBy(books.locationId)
			.all()
		const bookCountById = new Map(
			bookCounts
				.filter((r) => r.locationId !== null)
				.map((r) => [r.locationId as string, Number(r.count)]),
		)
		const childrenCounts = db
			.select({ parentId: locations.parentId, count: sql<number>`count(*)` })
			.from(locations)
			.groupBy(locations.parentId)
			.all()
		const childrenCountById = new Map<string, number>()
		for (const r of childrenCounts) {
			if (r.parentId) childrenCountById.set(r.parentId, Number(r.count))
		}
		const enriched: LocationJson[] = rows.map((r) => {
			const path = buildLocationPath(byId, r.id)
			return {
				...r,
				bookCount: bookCountById.get(r.id) ?? 0,
				childrenCount: childrenCountById.get(r.id) ?? 0,
				path,
				fullPath: locationFullPath(path),
				depth: path.length - 1,
			}
		})
		const filtered = enriched
			.filter((l) => !q || l.name.toLowerCase().includes(q) || l.fullPath.toLowerCase().includes(q))
			.sort((a, b) => a.fullPath.localeCompare(b.fullPath))
		return c.json({ locations: filtered })
	})
	.post('/', vValidator('json', CreateLocationSchema), async (c) => {
		const db = getDb()
		const data = c.req.valid('json')
		const name = data.name.trim()
		let parentId: string | null = null
		if (data.parentId != null) {
			const [parent] = db.select().from(locations).where(eq(locations.id, data.parentId)).all()
			if (!parent) return jsonError(c, 'Unknown parent id', 400)
			parentId = parent.id
		}
		if (siblingNameTaken(db, name, parentId)) {
			return jsonError(c, 'A location with this name already exists here', 409)
		}
		const id = crypto.randomUUID()
		db.insert(locations).values({ id, name, parentId, createdAt: Date.now() }).run()
		const [row] = db.select().from(locations).where(eq(locations.id, id)).all()
		const { byId } = locationMaps(db)
		const path = buildLocationPath(byId, id)
		return c.json(
			{
				location: {
					...row,
					bookCount: 0,
					childrenCount: 0,
					path,
					fullPath: locationFullPath(path),
					depth: path.length - 1,
				},
			},
			201,
		)
	})
	.patch('/:id', vValidator('json', UpdateLocationSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const [existing] = db.select().from(locations).where(eq(locations.id, id)).all()
		if (!existing) return jsonError(c, 'Not found', 404)
		const { byId } = locationMaps(db)
		let nextName = existing.name
		let nextParentId = existing.parentId ?? null
		if (data.name !== undefined) {
			nextName = data.name.trim()
		}
		if (data.parentId !== undefined) {
			if (data.parentId === null) {
				nextParentId = null
			} else {
				if (data.parentId === id) return jsonError(c, 'A location cannot be its own parent', 400)
				const [parent] = db.select().from(locations).where(eq(locations.id, data.parentId)).all()
				if (!parent) return jsonError(c, 'Unknown parent id', 400)
				if (isDescendant(byId, id, data.parentId)) {
					return jsonError(c, 'Cannot move a location into its own subtree', 400)
				}
				nextParentId = parent.id
			}
		}
		if (siblingNameTaken(db, nextName, nextParentId, id)) {
			return jsonError(c, 'A location with this name already exists here', 409)
		}
		db.update(locations)
			.set({ name: nextName, parentId: nextParentId })
			.where(eq(locations.id, id))
			.run()
		const [row] = db.select().from(locations).where(eq(locations.id, id)).all()
		const fresh = locationMaps(db)
		const path = buildLocationPath(fresh.byId, id)
		return c.json({
			location: {
				...row,
				path,
				fullPath: locationFullPath(path),
				depth: path.length - 1,
			},
		})
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const [existing] = db.select().from(locations).where(eq(locations.id, id)).all()
		if (!existing) return c.json({ ok: true })
		const newParent = existing.parentId ?? null
		// Reparent children to the deleted location's parent (or root).
		// Refuse when that would create duplicate sibling names; the user can rename first.
		const all = db.select().from(locations).all()
		const staying = new Set(
			all
				.filter((r) => (r.parentId ?? null) === (newParent ?? null) && r.id !== id)
				.map((r) => r.name.toLowerCase()),
		)
		const moving = all.filter((r) => r.parentId === id)
		const seenMoving = new Set<string>()
		for (const child of moving) {
			const key = child.name.toLowerCase()
			if (staying.has(key) || seenMoving.has(key)) {
				return jsonError(c, `Cannot delete: sub-location "${child.name}" already exists here`, 409)
			}
			seenMoving.add(key)
		}
		db.update(locations).set({ parentId: newParent }).where(eq(locations.parentId, id)).run()
		// Books in the deleted location become unlocated (same as publisher delete).
		db.update(books).set({ locationId: null }).where(eq(books.locationId, id)).run()
		db.delete(locations).where(eq(locations.id, id)).run()
		return c.json({ ok: true })
	})
