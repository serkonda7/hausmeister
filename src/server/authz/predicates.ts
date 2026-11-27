// SQL predicates over `items` that mirror `itemLevel` (./levels.ts) exactly.
// Every list, search and export query ANDs one of these in (DESIGN §3.4,
// implementation rules); nothing filters items in JS.
import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { itemGrants, items } from '../db/schema'
import type { AuthCtx } from './ctx'
import { atLeast, grantLevelsAtLeast, ROLE_CEILING, type VisibleLevel } from './levels'

/** `items` or an alias of it (`alias(items, "i")`), for self-joins. */
export type ItemsTableLike = {
	id: AnySQLiteColumn
	ownerKind: AnySQLiteColumn
	ownerId: AnySQLiteColumn
	visibility: AnySQLiteColumn
}

const TRUE = sql`1 = 1`
const FALSE = sql`1 = 0`

/** ctx owns the item directly or through a group. Never NULL (owner_kind is NOT NULL). */
function ownsWhere(ctx: AuthCtx, t: ItemsTableLike): SQL {
	const gids = [...ctx.groupIds]
	const mine = and(eq(t.ownerKind, 'user'), eq(t.ownerId, ctx.userId)) as SQL
	if (gids.length === 0) return mine
	return or(mine, and(eq(t.ownerKind, 'group'), inArray(t.ownerId, gids))) as SQL
}

/** Some grant on the item gives ctx (directly or via a group) at least `min`. */
function grantAtLeastWhere(ctx: AuthCtx, min: VisibleLevel, t: ItemsTableLike): SQL {
	const gids = [...ctx.groupIds]
	const toMe = and(eq(itemGrants.principalKind, 'user'), eq(itemGrants.principalId, ctx.userId))
	const principal =
		gids.length === 0
			? toMe
			: or(
					toMe,
					and(
						eq(itemGrants.principalKind, 'group'),
						inArray(itemGrants.principalId, gids),
					),
				)
	return sql`exists (select 1 from ${itemGrants} where ${itemGrants.itemId} = ${t.id} and ${inArray(
		itemGrants.level,
		grantLevelsAtLeast(min),
	)} and ${principal})`
}

/**
 * True exactly for the items where `itemLevel(ctx, item, grants) >= min`.
 * Composes with other conditions, joins and `items_fts`; never evaluates to
 * NULL, so `not(...)` gives the exact complement. Pass `table` when the query
 * uses an alias of `items`.
 */
export function itemsAtLeastWhere(
	ctx: AuthCtx,
	min: VisibleLevel,
	table: ItemsTableLike = items,
): SQL {
	if (ctx.role === 'admin') return TRUE
	// The ceiling caps everything, grants and ownership alike.
	if (!atLeast(ROLE_CEILING[ctx.role], min)) return FALSE

	const parts: SQL[] = [ownsWhere(ctx, table)]
	if (ctx.role === 'member') {
		// Household-owned items: edit (any visibility).
		if (atLeast('edit', min)) parts.push(eq(table.ownerKind, 'household'))
		// Someone else's item with household visibility: view.
		if (atLeast('view', min)) parts.push(eq(table.visibility, 'household'))
	}
	parts.push(grantAtLeastWhere(ctx, min, table))
	return sql`(${or(...parts)})`
}

/** Items ctx can see (level >= view). AND it into every list, search and export query. */
export function visibleItemsWhere(ctx: AuthCtx, table: ItemsTableLike = items): SQL {
	return itemsAtLeastWhere(ctx, 'view', table)
}

/**
 * Items whose price ctx may see (level >= edit). Price filters and price sorting
 * must be restricted to these rows, or the sort order leaks hidden prices.
 */
export function moneyVisibleWhere(ctx: AuthCtx, table: ItemsTableLike = items): SQL {
	return itemsAtLeastWhere(ctx, 'edit', table)
}
