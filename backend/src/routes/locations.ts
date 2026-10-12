import { vValidator } from '@hono/valibot-validator'
import { count, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import {
	CreateLocationSchema,
	canEditLocation,
	type PublicUser,
	UpdateLocationSchema,
} from 'shared/src/book'
import { type Db, getDb } from '../db'
import { books, locations, users } from '../schema'
import { type AppEnv, currentUser } from '../util/auth'
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
	const ownerById = new Map(
		db
			.select({ id: users.id, username: users.username, displayName: users.displayName })
			.from(users)
			.all()
			.map((u) => [u.id, u]),
	)
	const all = [...locationPaths(db).values()]
	return all.map((l) => ({
		...l,
		owner: l.ownerId ? (ownerById.get(l.ownerId) ?? null) : null,
		bookCount: bookCountById.get(l.id) ?? 0,
		childrenCount: all.filter((child) => child.parentId === l.id).length,
	}))
}

function requireEditableLocation(db: Db, id: string, user: PublicUser): LocationRow {
	const row =
		db.select().from(locations).where(eq(locations.id, id)).get() ?? fail(404, 'Not found')
	if (!canEditLocation(row, user)) fail(403, 'Forbidden: you can only edit your own locations')
	return row
}

/** Books can only be put into your own locations; admins may use any. */
export function assertAssignableLocation(db: Db, id: string, user: PublicUser): void {
	const row = db.select().from(locations).where(eq(locations.id, id)).get()
	if (!row) fail(400, 'Unknown location id')
	if (!canEditLocation(row, user)) fail(403, 'Forbidden: you can only use your own locations')
}

/** A location tree has a single owner, so the parent must belong to `ownerId` too. */
function assertParentOwnedBy(db: Db, parentId: string, ownerId: string | null): LocationPath {
	const parent = locationPaths(db).get(parentId) ?? fail(400, 'Unknown parent id')
	if (parent.ownerId !== ownerId) fail(403, 'Forbidden: the parent belongs to someone else')
	return parent
}

/** Sibling names are unique; top-level names only per owner. */
function assertNameFreeAmongSiblings(
	db: Db,
	name: string,
	parentId: string | null,
	ownerId: string | null,
	ownId?: string,
): void {
	const taken = db
		.select()
		.from(locations)
		.all()
		.some(
			(r) =>
				r.id !== ownId &&
				r.parentId === parentId &&
				(parentId !== null || r.ownerId === ownerId) &&
				r.name.toLowerCase() === name.toLowerCase(),
		)
	if (taken) fail(409, 'A location with this name already exists here')
}

function locationJson(db: Db, id: string) {
	return listLocations(db).find((l) => l.id === id)
}

// Anyone may add locations; renaming, moving and deleting them is up to the owner or an admin.
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
		const ownerId = currentUser(c).id
		const { name, parentId = null } = c.req.valid('json')
		if (parentId !== null) assertParentOwnedBy(db, parentId, ownerId)
		assertNameFreeAmongSiblings(db, name, parentId, ownerId)
		const id = crypto.randomUUID()
		db.insert(locations).values({ id, name, parentId, ownerId, createdAt: Date.now() }).run()
		return c.json({ location: locationJson(db, id) }, 201)
	})
	.patch('/:id', vValidator('json', UpdateLocationSchema), (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		const existing = requireEditableLocation(db, id, currentUser(c))
		const name = data.name ?? existing.name
		const parentId = data.parentId === undefined ? existing.parentId : data.parentId
		if (parentId === id) fail(400, 'A location cannot be its own parent')
		if (parentId !== null && data.parentId !== undefined) {
			const parent = assertParentOwnedBy(db, parentId, existing.ownerId)
			if (parent.path.some((p) => p.id === id)) {
				fail(400, 'Cannot move a location into its own subtree')
			}
		}
		assertNameFreeAmongSiblings(db, name, parentId, existing.ownerId, id)
		db.update(locations).set({ name, parentId }).where(eq(locations.id, id)).run()
		return c.json({ location: locationJson(db, id) })
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const existing = db.select().from(locations).where(eq(locations.id, id)).get()
		if (!existing) return c.json({ ok: true })
		if (!canEditLocation(existing, currentUser(c))) {
			fail(403, 'Forbidden: you can only delete your own locations')
		}
		// Reparent children to the deleted location's parent (or root).
		// Refuse when that would create duplicate sibling names; the user can rename first.
		const all = db.select().from(locations).all()
		const taken = new Set(
			all
				.filter(
					(r) =>
						r.parentId === existing.parentId &&
						r.id !== id &&
						(existing.parentId !== null || r.ownerId === existing.ownerId),
				)
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
