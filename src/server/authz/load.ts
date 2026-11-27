// Loading items together with the caller's level. "Cannot see" and "does not
// exist" are the same answer (null / 404, never 403; DESIGN §11).
import { and, eq, inArray, or, type SQL } from 'drizzle-orm'
import { HttpError } from '../auth/context'
import type { AppDb } from '../db/client'
import { type Item, itemGrants, items } from '../db/schema'
import type { AuthCtx } from './ctx'
import {
	atLeast,
	type GrantRef,
	type ItemAuthFields,
	itemLevel,
	type Level,
	type VisibleLevel,
} from './levels'

export type LeveledItem<T = Item> = { item: T; level: VisibleLevel }

/** item_grants rows that can apply to ctx (to the user, or to one of its groups). */
function grantsForCtxWhere(ctx: AuthCtx): SQL {
	const toMe = and(eq(itemGrants.principalKind, 'user'), eq(itemGrants.principalId, ctx.userId))
	const gids = [...ctx.groupIds]
	if (gids.length === 0) return toMe as SQL
	return or(
		toMe,
		and(eq(itemGrants.principalKind, 'group'), inArray(itemGrants.principalId, gids)),
	) as SQL
}

// Keeps the number of bound parameters well below SQLite's limit.
const CHUNK = 500

/** The ctx-relevant grants of the given items, grouped by item id. */
function loadGrants(db: AppDb, ctx: AuthCtx, itemIds: readonly string[]) {
	const byItem = new Map<string, GrantRef[]>()
	const ids = [...new Set(itemIds)]
	for (let i = 0; i < ids.length; i += CHUNK) {
		const rows = db
			.select({
				itemId: itemGrants.itemId,
				principalKind: itemGrants.principalKind,
				principalId: itemGrants.principalId,
				level: itemGrants.level,
			})
			.from(itemGrants)
			.where(and(inArray(itemGrants.itemId, ids.slice(i, i + CHUNK)), grantsForCtxWhere(ctx)))
			.all()
		for (const r of rows) {
			const list = byItem.get(r.itemId)
			if (list) list.push(r)
			else byItem.set(r.itemId, [r])
		}
	}
	return byItem
}

/**
 * The caller's level for each of a page of already-loaded items, keyed by item
 * id, with one grants query per 500 items (none for admins).
 */
export function itemLevels(
	db: AppDb,
	ctx: AuthCtx,
	rows: readonly ItemAuthFields[],
): Map<string, Level> {
	const out = new Map<string, Level>()
	if (rows.length === 0) return out
	const grants =
		ctx.role === 'admin'
			? new Map<string, GrantRef[]>()
			: loadGrants(
					db,
					ctx,
					rows.map((r) => r.id),
				)
	for (const r of rows) out.set(r.id, itemLevel(ctx, r, grants.get(r.id) ?? []))
	return out
}

/**
 * Pairs each row with the caller's level, dropping rows below `min`. Rows from
 * a query that ANDed `visibleItemsWhere(ctx)` are never dropped at `min = view`;
 * the drop is a safety net, not a filter (filter in SQL).
 */
export function withLevels<T extends ItemAuthFields>(
	db: AppDb,
	ctx: AuthCtx,
	rows: readonly T[],
	min: VisibleLevel = 'view',
): LeveledItem<T>[] {
	const levels = itemLevels(db, ctx, rows)
	const out: LeveledItem<T>[] = []
	for (const item of rows) {
		const level = levels.get(item.id) ?? 'none'
		if (level !== 'none' && atLeast(level, min)) out.push({ item, level })
	}
	return out
}

/**
 * Loads one item with the caller's level. Returns null when the item does not
 * exist or the caller's level is below `min`; callers answer both with 404.
 */
export function loadItemForCtx(
	db: AppDb,
	ctx: AuthCtx,
	itemId: string,
	min: VisibleLevel = 'view',
): LeveledItem | null {
	const item = db.select().from(items).where(eq(items.id, itemId)).get()
	if (!item) return null
	const level = itemLevels(db, ctx, [item]).get(item.id) ?? 'none'
	if (level === 'none' || !atLeast(level, min)) return null
	return { item, level }
}

/**
 * For server functions: 404 when the caller cannot see the item (or it does not
 * exist), 403 when it can see it but its level is below `min` (the item's
 * existence is no secret then). Returns the item with its level otherwise.
 */
export function requireItemForCtx(
	db: AppDb,
	ctx: AuthCtx,
	itemId: string,
	min: VisibleLevel = 'view',
): LeveledItem {
	const found = loadItemForCtx(db, ctx, itemId, 'view')
	if (!found) throw new HttpError(404, 'Not found')
	if (!atLeast(found.level, min)) throw new HttpError(403, 'Forbidden')
	return found
}
