import { sql } from 'drizzle-orm'
import type { getDb } from '../db'
import { locations } from '../schema'

type Db = ReturnType<typeof getDb>
export type LocationRow = typeof locations.$inferSelect

export function locationMaps(db: Db): {
	byId: Map<string, LocationRow>
	childrenByParent: Map<string | null, LocationRow[]>
} {
	const rows = db.select().from(locations).all()
	const byId = new Map(rows.map((r) => [r.id, r]))
	const childrenByParent = new Map<string | null, LocationRow[]>()
	for (const row of rows) {
		const key = row.parentId ?? null
		const list = childrenByParent.get(key) ?? []
		list.push(row)
		childrenByParent.set(key, list)
	}
	for (const list of childrenByParent.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name))
	}
	return { byId, childrenByParent }
}

export function buildLocationPath(
	byId: Map<string, LocationRow>,
	id: string,
): Array<{ id: string; name: string }> {
	const path: Array<{ id: string; name: string }> = []
	const seen = new Set<string>()
	let current: LocationRow | undefined = byId.get(id)
	// Walk up; guard against corrupt cycles.
	while (current && !seen.has(current.id)) {
		seen.add(current.id)
		path.unshift({ id: current.id, name: current.name })
		if (!current.parentId) break
		current = byId.get(current.parentId)
		if (path.length > 100) break
	}
	return path
}

export function locationFullPath(path: Array<{ name: string }>): string {
	return path.map((p) => p.name).join(' / ')
}

export function locationMap(
	db: Db,
	locationIds: string[],
): Map<string, { id: string; name: string; parentId: string | null }> {
	const map = new Map<string, { id: string; name: string; parentId: string | null }>()
	const ids = [...new Set(locationIds.filter(Boolean))]
	if (ids.length === 0) return map
	const rows = db
		.select()
		.from(locations)
		.where(
			sql`${locations.id} IN (${sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `,
			)})`,
		)
		.all()
	for (const r of rows) {
		map.set(r.id, { id: r.id, name: r.name, parentId: r.parentId ?? null })
	}
	return map
}

export function locationPathStrings(
	db: Db,
	locationIds: string[],
): Map<string, { path: Array<{ id: string; name: string }>; fullPath: string }> {
	const { byId } = locationMaps(db)
	const map = new Map<string, { path: Array<{ id: string; name: string }>; fullPath: string }>()
	for (const id of new Set(locationIds.filter(Boolean))) {
		if (!byId.has(id)) continue
		const path = buildLocationPath(byId, id)
		map.set(id, { path, fullPath: locationFullPath(path) })
	}
	return map
}

export function isDescendant(
	byId: Map<string, LocationRow>,
	ancestorId: string,
	candidateId: string,
): boolean {
	let current = byId.get(candidateId)
	const seen = new Set<string>()
	while (current?.parentId) {
		if (seen.has(current.id)) break
		seen.add(current.id)
		if (current.parentId === ancestorId) return true
		current = byId.get(current.parentId)
	}
	return false
}

export function siblingNameTaken(
	db: Db,
	name: string,
	parentId: string | null,
	excludeId?: string,
): boolean {
	const rows = db.select().from(locations).all()
	const key = name.toLowerCase()
	return rows.some(
		(r) =>
			r.id !== excludeId &&
			(r.parentId ?? null) === (parentId ?? null) &&
			r.name.toLowerCase() === key,
	)
}
