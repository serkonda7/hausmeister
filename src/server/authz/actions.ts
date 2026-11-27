// App-level actions (DESIGN §3.5): what a role may do outside of one item.
// "Edit or delete item types" depends on item data and lives in the item-types
// module, not here.
import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm'
import { HttpError } from '../auth/context'
import { items } from '../db/schema'
import type { AuthCtx, Role } from './ctx'
import { type ItemsTableLike, visibleItemsWhere } from './predicates'

export const APP_ACTIONS = {
	/** Invite users, change roles, disable users. */
	'users.manage': ['admin'],
	'groups.manage': ['admin'],
	'itemTypes.create': ['admin', 'member'],
	'locations.create': ['admin', 'member'],
	'items.create': ['admin', 'member'],
	/** Any export at all; what it contains is exportScope / exportItemsWhere. */
	export: ['admin', 'member'],
} as const satisfies Record<string, readonly Role[]>

export type AppAction = keyof typeof APP_ACTIONS

export function can(ctx: AuthCtx, action: AppAction): boolean {
	return (APP_ACTIONS[action] as readonly Role[]).includes(ctx.role)
}

/** Throws HttpError(403) unless ctx may perform the action. */
export function requireCan(ctx: AuthCtx, action: AppAction): AuthCtx {
	if (!can(ctx, action)) throw new HttpError(403, 'Forbidden')
	return ctx
}

/**
 * Export (DESIGN §3.5): admins export everything; members their own items
 * (directly or via a group) and household items; guests nothing.
 */
export type ExportScope = 'all' | 'own_and_household' | 'none'

export function exportScope(ctx: AuthCtx): ExportScope {
	if (ctx.role === 'admin') return 'all'
	if (ctx.role === 'member') return 'own_and_household'
	return 'none'
}

/**
 * The items an export contains, as a predicate over `items`. Serialize the rows
 * with serializeItem / serializeItemsForCtx as usual so money follows the level
 * (for a member, every exported item is at edit or above).
 */
export function exportItemsWhere(ctx: AuthCtx, table: ItemsTableLike = items): SQL {
	const scope = exportScope(ctx)
	if (scope === 'all') return sql`1 = 1`
	if (scope === 'none') return sql`1 = 0`
	// Owned (directly or via a group) or household-owned. Both are already
	// visible to a member; ANDing the visibility predicate keeps that explicit.
	const gids = [...ctx.groupIds]
	const scoped = or(
		eq(table.ownerKind, 'household'),
		and(eq(table.ownerKind, 'user'), eq(table.ownerId, ctx.userId)),
		gids.length ? and(eq(table.ownerKind, 'group'), inArray(table.ownerId, gids)) : undefined,
	) as SQL
	return and(scoped, visibleItemsWhere(ctx, table)) as SQL
}
