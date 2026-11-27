// Loading an item for an operation, with the 404-not-403 rule (DESIGN §11),
// optimistic locking (DESIGN §6) and unique short codes.
import { and, eq, inArray } from 'drizzle-orm'
import { generateShortCode } from '../../lib/short-code'
import { atLeast, type LeveledItem, loadItemForCtx, type VisibleLevel } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb, DbOrTx } from '../db/client'
import { type Item, items, locations, type NewItem } from '../db/schema'
import { conflict, forbidden, ItemsError, notFound } from './errors'

/**
 * The item with the caller's level. ITEM_NOT_FOUND (404) when it does not
 * exist or is invisible; ITEM_FORBIDDEN (403) when visible but below `min`.
 */
export function requireItem(
	db: DbOrTx,
	ctx: AuthCtx,
	id: string,
	min: VisibleLevel = 'view',
): LeveledItem {
	const found = loadItemForCtx(db as AppDb, ctx, id, 'view')
	if (!found) throw notFound()
	if (!atLeast(found.level, min)) throw forbidden()
	return found
}

/** VERSION_CONFLICT (409) unless the caller edited the current version. */
export function assertVersion(item: Pick<Item, 'version'>, version: number) {
	if (item.version !== version) throw conflict()
}

/**
 * Writes `set` and increments the version, but only if the row still has
 * `version` (belt and braces next to assertVersion). Returns the new version.
 */
export function writeVersioned(
	db: DbOrTx,
	id: string,
	version: number,
	set: Partial<NewItem>,
): number {
	const r = db
		.update(items)
		.set({ ...set, version: version + 1, updatedAt: new Date() })
		.where(and(eq(items.id, id), eq(items.version, version)))
		.run() as unknown as { changes: number }
	if (r.changes !== 1) throw conflict()
	return version + 1
}

/** A short code unused by any item and any location (QR labels resolve both). */
export function uniqueShortCode(db: DbOrTx): string {
	for (let attempt = 0; attempt < 50; attempt++) {
		const codes = Array.from({ length: 8 }, () => generateShortCode(6))
		const taken = new Set([
			...db
				.select({ c: items.shortCode })
				.from(items)
				.where(inArray(items.shortCode, codes))
				.all()
				.map((r) => r.c),
			...db
				.select({ c: locations.shortCode })
				.from(locations)
				.where(inArray(locations.shortCode, codes))
				.all()
				.map((r) => r.c),
		])
		const free = codes.find((c) => !taken.has(c))
		if (free) return free
	}
	throw new ItemsError(409, 'INVALID_INPUT', 'short code space exhausted')
}
