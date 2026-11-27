// The in-app inbox (DESIGN §5.6): low stock, loan requests and answers, ownership transfers.
// Written by the stock, loans and transfers services inside their transactions; v1.2 sends the same notices as Web Push.
//
// Who hears about an item:
//   ownerAudience    the people the item belongs to: its user owner, the members of its owning group, or for household items every active admin and member (low stock).
//   managerAudience  the people who decide about it (loan requests): its user owner or owning group's members, for household items the admins, plus everyone with a `manage` grant.
// Item names are read live and only when the reader can still see the item; the payload carries the other display data (names at the time).
import { and, desc, eq, inArray, isNull, lt, or, type SQL, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { JsonObject } from '../../lib/items/types'
import type { NotificationEntry, NotificationKind, NotificationPage } from '../../lib/notifications'
import { visibleItemsWhere } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb, DbOrTx } from '../db/client'
import { groupMembers, type Item, itemGrants, items, notifications, users } from '../db/schema'
import { ItemsError, parseInput } from '../items/errors'

type AudienceItem = Pick<Item, 'id' | 'ownerKind' | 'ownerId'>

/** Active users among `ids`. */
function activeUsers(db: DbOrTx, ids: readonly string[]): string[] {
	if (ids.length === 0) return []
	return db
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.id, [...new Set(ids)]), isNull(users.disabledAt)))
		.all()
		.map((u) => u.id)
}

function groupMemberIds(db: DbOrTx, groupIds: readonly string[]): string[] {
	if (groupIds.length === 0) return []
	return db
		.select({ id: groupMembers.userId })
		.from(groupMembers)
		.where(inArray(groupMembers.groupId, [...groupIds]))
		.all()
		.map((r) => r.id)
}

function usersWithRole(db: DbOrTx, roles: readonly ('admin' | 'member')[]): string[] {
	return db
		.select({ id: users.id })
		.from(users)
		.where(and(inArray(users.role, [...roles]), isNull(users.disabledAt)))
		.all()
		.map((u) => u.id)
}

/** The direct owners: user owner, or the members of the owning group. */
function ownerIds(db: DbOrTx, item: AudienceItem): string[] {
	if (item.ownerKind === 'user' && item.ownerId) return [item.ownerId]
	if (item.ownerKind === 'group' && item.ownerId) return groupMemberIds(db, [item.ownerId])
	return []
}

export function ownerAudience(db: DbOrTx, item: AudienceItem): string[] {
	if (item.ownerKind === 'household') return usersWithRole(db, ['admin', 'member'])
	return activeUsers(db, ownerIds(db, item))
}

export function managerAudience(db: DbOrTx, item: AudienceItem): string[] {
	const out = item.ownerKind === 'household' ? usersWithRole(db, ['admin']) : ownerIds(db, item)
	const grants = db
		.select({ kind: itemGrants.principalKind, id: itemGrants.principalId })
		.from(itemGrants)
		.where(and(eq(itemGrants.itemId, item.id), eq(itemGrants.level, 'manage')))
		.all()
	for (const g of grants) if (g.kind === 'user') out.push(g.id)
	out.push(
		...groupMemberIds(
			db,
			grants.filter((g) => g.kind === 'group').map((g) => g.id),
		),
	)
	return activeUsers(db, out)
}

/**
 * Adds one notice per recipient (active users only, `exclude` left out, usually the actor).
 * With `dedupe`, a user who still has an unread notice of the same kind for the item gets no second one.
 */
export function notify(
	db: DbOrTx,
	n: {
		userIds: readonly string[]
		exclude?: string | null
		kind: NotificationKind
		itemId: string | null
		payload?: Record<string, unknown>
		dedupe?: boolean
	},
): number {
	let ids = activeUsers(
		db,
		n.userIds.filter((id) => id !== n.exclude),
	)
	if (n.dedupe && n.itemId && ids.length) {
		const has = new Set(
			db
				.select({ u: notifications.userId })
				.from(notifications)
				.where(
					and(
						eq(notifications.itemId, n.itemId),
						eq(notifications.kind, n.kind),
						isNull(notifications.readAt),
						inArray(notifications.userId, ids),
					),
				)
				.all()
				.map((r) => r.u),
		)
		ids = ids.filter((id) => !has.has(id))
	}
	if (ids.length === 0) return 0
	db.insert(notifications)
		.values(
			ids.map((userId) => ({
				userId,
				kind: n.kind,
				itemId: n.itemId,
				payload: n.payload ?? {},
			})),
		)
		.run()
	return ids.length
}

/** Removes unread notices of a kind for an item (e.g. low stock after a restock). */
export function withdrawNotices(db: DbOrTx, itemId: string, kind: NotificationKind) {
	db.delete(notifications)
		.where(
			and(
				eq(notifications.itemId, itemId),
				eq(notifications.kind, kind),
				isNull(notifications.readAt),
			),
		)
		.run()
}

const listInput = z.object({
	cursor: z.string().max(200).optional(),
	limit: z.number().int().min(1).max(100).optional(),
})

type Cursor = { at: number; id: string }
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decode(raw: string): Cursor {
	try {
		const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor
		if (typeof c?.at === 'number' && typeof c?.id === 'string') return c
	} catch {
		// fall through
	}
	throw new ItemsError(422, 'CURSOR_INVALID')
}

export function unreadCount(db: AppDb, ctx: AuthCtx): number {
	return (
		db
			.select({ n: sql<number>`count(*)` })
			.from(notifications)
			.where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)))
			.get()?.n ?? 0
	)
}

/** Newest first, with the item (name, short code) where the caller can see it. */
export function listNotifications(
	db: AppDb,
	ctx: AuthCtx,
	raw: { cursor?: string; limit?: number } = {},
): NotificationPage {
	const input = parseInput(listInput, raw)
	const limit = input.limit ?? 30
	const conds: (SQL | undefined)[] = [eq(notifications.userId, ctx.userId)]
	if (input.cursor) {
		const c = decode(input.cursor)
		conds.push(
			or(
				lt(notifications.createdAt, new Date(c.at)),
				and(eq(notifications.createdAt, new Date(c.at)), lt(notifications.id, c.id)),
			),
		)
	}
	const rows = db
		.select({ n: notifications, itemName: items.name, shortCode: items.shortCode })
		.from(notifications)
		.leftJoin(items, and(eq(items.id, notifications.itemId), visibleItemsWhere(ctx)))
		.where(and(...conds))
		.orderBy(desc(notifications.createdAt), desc(notifications.id))
		.limit(limit + 1)
		.all()
	const page = rows.slice(0, limit)
	const last = page.at(-1)
	const entries: NotificationEntry[] = page.map((r) => ({
		id: r.n.id,
		kind: r.n.kind as NotificationKind,
		at: r.n.createdAt,
		read: !!r.n.readAt,
		item:
			r.n.itemId && r.itemName !== null
				? { id: r.n.itemId, name: r.itemName, shortCode: r.shortCode }
				: null,
		payload: (r.n.payload ?? {}) as JsonObject,
	}))
	return {
		entries,
		nextCursor:
			rows.length > limit && last
				? encode({ at: last.n.createdAt.getTime(), id: last.n.id })
				: null,
		unread: unreadCount(db, ctx),
	}
}

export const markReadInput = z.object({
	/** Omit to mark all as read. */
	ids: z.array(z.string().min(1).max(64)).max(200).optional(),
})

export function markNotificationsRead(
	db: AppDb,
	ctx: AuthCtx,
	raw: { ids?: string[] },
): { unread: number } {
	const input = parseInput(markReadInput, raw)
	db.update(notifications)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(notifications.userId, ctx.userId),
				isNull(notifications.readAt),
				input.ids ? inArray(notifications.id, input.ids) : undefined,
			),
		)
		.run()
	return { unread: unreadCount(db, ctx) }
}
