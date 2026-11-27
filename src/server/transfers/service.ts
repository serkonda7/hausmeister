// Ownership transfers (DESIGN §3.6): gifts and hand-me-downs between people and groups, with the new owner's consent.
//
//   start    manage on the item. Target: an active non-guest user or a group, not the current owner.
//            Someone who is neither an admin nor the item's direct user owner (a manage grantee, a co-member of the owning group) may not offer it to themselves or to one of their own groups: that would take the item from its owner.
//            One pending transfer per item.
//   accept / decline
//            the new owner: that user, or any member of that group.
//            They need not see the item yet (it was offered to them on purpose), so the offer shows its name; accepting fails as TRANSFER_STALE (and the offer is withdrawn) when the owner changed in the meantime.
//   cancel   whoever started it, or anyone with manage on the item.
//   force    admins: completes a pending transfer without waiting.
// Visibility stays as it is (a user or group may own private items).
// Grants and loans are kept.
// Every step is an item event; the owner change itself is item.owner_changed with reason "transfer".
// The owners hear about offers started by someone else; the new owner and the starter about the outcome.
import { and, asc, eq, inArray, or, type SQL } from 'drizzle-orm'
import {
	type StartTransferInput,
	startTransferInput,
	type TransferActions,
	type TransferListRow,
	type TransferOverview,
	type TransferRow,
	transferRefInput,
} from '../../lib/transfers/types'
import { m } from '../../paraglide/messages'
import { atLeast, canChangeOwner, itemLevels, type Level, validateOwner } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb, DbOrTx } from '../db/client'
import {
	groupMembers,
	type Item,
	items,
	itemTypes,
	type Transfer,
	transfers,
	users,
} from '../db/schema'
import { recordItemEvent } from '../history/record'
import { requireItem, writeVersioned } from '../items/access'
import { forbidden, ItemsError, parseInput } from '../items/errors'
import { notify } from '../notifications/service'
import { ownerRefs } from '../search/query'

const asDb = (tx: DbOrTx) => tx as unknown as AppDb

const userName = (db: DbOrTx, id: string) =>
	db.select({ n: users.displayName }).from(users).where(eq(users.id, id)).get()?.n ??
	m.history_unknown_actor()

function membersOf(db: DbOrTx, groupId: string): string[] {
	return db
		.select({ u: groupMembers.userId })
		.from(groupMembers)
		.where(eq(groupMembers.groupId, groupId))
		.all()
		.map((r) => r.u)
}

/** The users behind an owner (household: nobody in particular). */
function peopleOf(db: DbOrTx, kind: Item['ownerKind'], id: string | null): string[] {
	if (kind === 'user' && id) return [id]
	if (kind === 'group' && id) return membersOf(db, id)
	return []
}

const isRecipient = (ctx: AuthCtx, t: Pick<Transfer, 'toOwnerKind' | 'toOwnerId'>) =>
	t.toOwnerKind === 'user' ? t.toOwnerId === ctx.userId : ctx.groupIds.has(t.toOwnerId)

function actionsFor(ctx: AuthCtx, t: Transfer, level: Level): TransferActions {
	const pending = t.status === 'pending'
	const recipient = isRecipient(ctx, t)
	return {
		accept: pending && recipient,
		decline: pending && recipient,
		cancel: pending && (t.createdBy === ctx.userId || atLeast(level, 'manage')),
		force: pending && ctx.role === 'admin' && !recipient,
	}
}

type Loaded = { t: Transfer; item: Item; level: Level }

/** TRANSFER_NOT_FOUND unless the caller is involved (recipient, starter) or manages the item. */
function loadTransfer(db: DbOrTx, ctx: AuthCtx, transferId: string): Loaded {
	const t = db.select().from(transfers).where(eq(transfers.id, transferId)).get()
	const item = t && db.select().from(items).where(eq(items.id, t.itemId)).get()
	if (!t || !item) throw new ItemsError(404, 'TRANSFER_NOT_FOUND')
	const level = itemLevels(asDb(db), ctx, [item]).get(item.id) ?? 'none'
	if (!isRecipient(ctx, t) && t.createdBy !== ctx.userId && !atLeast(level, 'manage'))
		throw new ItemsError(404, 'TRANSFER_NOT_FOUND')
	return { t, item, level }
}

function assertPending(t: Transfer) {
	if (t.status !== 'pending') throw new ItemsError(409, 'TRANSFER_STATE', t.status)
}

function ownerName(db: DbOrTx, kind: Item['ownerKind'], id: string | null): string {
	return ownerRefs(db, [{ ownerKind: kind, ownerId: id }])({ ownerKind: kind, ownerId: id }).name
}

const ownerDiff = (
	from: { kind: Item['ownerKind']; id: string | null },
	to: { kind: Item['ownerKind']; id: string | null },
) => ({
	ownerKind: { from: from.kind, to: to.kind },
	ownerId: { from: from.id, to: to.id },
})

/** Manage: offers the item to a user or group. Returns { transferId }. */
export function startTransfer(
	db: AppDb,
	ctx: AuthCtx,
	raw: StartTransferInput,
): { transferId: string } {
	const input = parseInput(startTransferInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.itemId, 'manage')
		const checked = validateOwner(asDb(tx), input.to)
		if (!checked.ok) throw new ItemsError(422, 'OWNER_INVALID', checked.error)
		const to = checked.value as { ownerKind: 'user' | 'group'; ownerId: string }
		if (to.ownerKind === item.ownerKind && to.ownerId === item.ownerId)
			throw new ItemsError(422, 'TRANSFER_SAME_OWNER')
		const toSelf =
			(to.ownerKind === 'user' && to.ownerId === ctx.userId) ||
			(to.ownerKind === 'group' && ctx.groupIds.has(to.ownerId))
		if (toSelf && !canChangeOwner(ctx, item)) throw new ItemsError(403, 'TRANSFER_TO_SELF')
		const pending = tx
			.select({ id: transfers.id })
			.from(transfers)
			.where(and(eq(transfers.itemId, item.id), eq(transfers.status, 'pending')))
			.get()
		if (pending) throw new ItemsError(409, 'TRANSFER_PENDING')
		const t = tx
			.insert(transfers)
			.values({
				itemId: item.id,
				fromOwnerKind: item.ownerKind,
				fromOwnerId: item.ownerId,
				toOwnerKind: to.ownerKind,
				toOwnerId: to.ownerId,
				note: input.note ?? null,
				createdBy: ctx.userId,
			})
			.returning()
			.get()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.transfer_started',
			itemId: item.id,
			diff: {
				transferId: t.id,
				...ownerDiff(
					{ kind: item.ownerKind, id: item.ownerId },
					{ kind: to.ownerKind, id: to.ownerId },
				),
			},
		})
		const actorName = userName(tx, ctx.userId)
		notify(tx, {
			userIds: peopleOf(tx, to.ownerKind, to.ownerId),
			exclude: ctx.userId,
			kind: 'transfer.requested',
			itemId: item.id,
			payload: { transferId: t.id, actorName, itemName: item.name },
		})
		const owners = peopleOf(tx, item.ownerKind, item.ownerId)
		if (!owners.includes(ctx.userId))
			notify(tx, {
				userIds: owners,
				exclude: ctx.userId,
				kind: 'transfer.started',
				itemId: item.id,
				payload: {
					transferId: t.id,
					actorName,
					toName: ownerName(tx, to.ownerKind, to.ownerId),
				},
			})
		return { transferId: t.id }
	})
}

/** Writes the new owner; TRANSFER_STALE (offer withdrawn) when the owner changed since the offer. */
function complete(
	tx: DbOrTx,
	ctx: AuthCtx,
	t: Transfer,
	item: Item,
	status: 'accepted' | 'forced',
) {
	if (item.ownerKind !== t.fromOwnerKind || item.ownerId !== t.fromOwnerId) {
		tx.update(transfers)
			.set({ status: 'cancelled', resolvedBy: ctx.userId, resolvedAt: new Date() })
			.where(eq(transfers.id, t.id))
			.run()
		return false
	}
	writeVersioned(tx, item.id, item.version, { ownerKind: t.toOwnerKind, ownerId: t.toOwnerId })
	tx.update(transfers)
		.set({ status, resolvedBy: ctx.userId, resolvedAt: new Date() })
		.where(eq(transfers.id, t.id))
		.run()
	recordItemEvent(tx, {
		actorId: ctx.userId,
		action: 'item.owner_changed',
		itemId: item.id,
		diff: {
			...ownerDiff(
				{ kind: item.ownerKind, id: item.ownerId },
				{ kind: t.toOwnerKind, id: t.toOwnerId },
			),
			reason: status === 'forced' ? 'transfer_forced' : 'transfer',
			transferId: t.id,
		},
	})
	if (t.createdBy)
		notify(tx, {
			userIds: [t.createdBy],
			exclude: ctx.userId,
			kind: 'transfer.accepted',
			itemId: item.id,
			payload: { transferId: t.id, actorName: userName(tx, ctx.userId) },
		})
	return true
}

function stale(): never {
	throw new ItemsError(409, 'TRANSFER_STALE')
}

/** The new owner accepts. */
export function acceptTransfer(db: AppDb, ctx: AuthCtx, raw: { transferId: string }) {
	const input = parseInput(transferRefInput, raw)
	const ok = db.transaction((tx) => {
		const { t, item, level } = loadTransfer(tx, ctx, input.transferId)
		assertPending(t)
		if (!actionsFor(ctx, t, level).accept) throw forbidden()
		return complete(tx, ctx, t, item, 'accepted')
	})
	if (!ok) stale()
}

/** Admin: completes a pending transfer without the new owner's answer. */
export function forceTransfer(db: AppDb, ctx: AuthCtx, raw: { transferId: string }) {
	const input = parseInput(transferRefInput, raw)
	const ok = db.transaction((tx) => {
		const { t, item, level } = loadTransfer(tx, ctx, input.transferId)
		assertPending(t)
		if (!actionsFor(ctx, t, level).force) throw forbidden()
		const done = complete(tx, ctx, t, item, 'forced')
		if (done)
			notify(tx, {
				userIds: peopleOf(tx, t.toOwnerKind, t.toOwnerId),
				exclude: ctx.userId,
				kind: 'transfer.accepted',
				itemId: item.id,
				payload: { transferId: t.id, actorName: userName(tx, ctx.userId) },
			})
		return done
	})
	if (!ok) stale()
}

function close(tx: DbOrTx, ctx: AuthCtx, t: Transfer, status: 'declined' | 'cancelled'): void {
	tx.update(transfers)
		.set({ status, resolvedBy: ctx.userId, resolvedAt: new Date() })
		.where(eq(transfers.id, t.id))
		.run()
	recordItemEvent(tx, {
		actorId: ctx.userId,
		action: status === 'declined' ? 'item.transfer_declined' : 'item.transfer_cancelled',
		itemId: t.itemId,
		diff: {
			transferId: t.id,
			...ownerDiff(
				{ kind: t.fromOwnerKind, id: t.fromOwnerId },
				{ kind: t.toOwnerKind, id: t.toOwnerId },
			),
		},
	})
	const actorName = userName(tx, ctx.userId)
	if (status === 'declined' && t.createdBy)
		notify(tx, {
			userIds: [t.createdBy],
			exclude: ctx.userId,
			kind: 'transfer.declined',
			itemId: t.itemId,
			payload: { transferId: t.id, actorName },
		})
	if (status === 'cancelled')
		notify(tx, {
			userIds: peopleOf(tx, t.toOwnerKind, t.toOwnerId),
			exclude: ctx.userId,
			kind: 'transfer.cancelled',
			itemId: t.itemId,
			payload: { transferId: t.id, actorName },
		})
}

/** The new owner says no. */
export function declineTransfer(db: AppDb, ctx: AuthCtx, raw: { transferId: string }) {
	const input = parseInput(transferRefInput, raw)
	db.transaction((tx) => {
		const { t, level } = loadTransfer(tx, ctx, input.transferId)
		assertPending(t)
		if (!actionsFor(ctx, t, level).decline) throw forbidden()
		close(tx, ctx, t, 'declined')
	})
}

/** The starter or a manager withdraws the offer. */
export function cancelTransfer(db: AppDb, ctx: AuthCtx, raw: { transferId: string }) {
	const input = parseInput(transferRefInput, raw)
	db.transaction((tx) => {
		const { t, level } = loadTransfer(tx, ctx, input.transferId)
		assertPending(t)
		if (!actionsFor(ctx, t, level).cancel) throw forbidden()
		close(tx, ctx, t, 'cancelled')
	})
}

// --- Reads -------------------------------------------------------------------------

function toRows(db: AppDb, ctx: AuthCtx, list: Transfer[]): TransferListRow[] {
	if (list.length === 0) return []
	const its = db
		.select({
			id: items.id,
			name: items.name,
			ownerKind: items.ownerKind,
			ownerId: items.ownerId,
			visibility: items.visibility,
			typeIcon: itemTypes.icon,
		})
		.from(items)
		.innerJoin(itemTypes, eq(itemTypes.id, items.typeId))
		.where(
			inArray(
				items.id,
				list.map((t) => t.itemId),
			),
		)
		.all()
	const byId = new Map(its.map((i) => [i.id, i]))
	const levels = itemLevels(db, ctx, its)
	const owners = [
		...list.map((t) => ({ ownerKind: t.fromOwnerKind, ownerId: t.fromOwnerId })),
		...list.map((t) => ({ ownerKind: t.toOwnerKind, ownerId: t.toOwnerId })),
	]
	const ref = ownerRefs(db, owners)
	const starterIds = [...new Set(list.flatMap((t) => (t.createdBy ? [t.createdBy] : [])))]
	const starters = new Map(
		starterIds.length
			? db
					.select({ id: users.id, n: users.displayName })
					.from(users)
					.where(inArray(users.id, starterIds))
					.all()
					.map((u) => [u.id, u.n])
			: [],
	)
	return list.flatMap((t) => {
		const it = byId.get(t.itemId)
		if (!it) return []
		const level = levels.get(it.id) ?? 'none'
		const row: TransferRow = {
			id: t.id,
			itemId: t.itemId,
			from: ref({ ownerKind: t.fromOwnerKind, ownerId: t.fromOwnerId }),
			to: ref({ ownerKind: t.toOwnerKind, ownerId: t.toOwnerId }),
			note: t.note,
			createdBy: t.createdBy
				? { id: t.createdBy, name: starters.get(t.createdBy) ?? m.history_unknown_actor() }
				: null,
			createdAt: t.createdAt,
			toMe: isRecipient(ctx, t),
			actions: actionsFor(ctx, t, level),
		}
		return [
			{
				...row,
				item: {
					id: it.id,
					name: it.name,
					typeIcon: it.typeIcon,
					visible: level !== 'none',
				},
			},
		]
	})
}

/** The pending transfer of an item, for its managers and the new owner (else null). */
export function getItemTransfer(db: AppDb, ctx: AuthCtx, itemId: string): TransferRow | null {
	const { level } = requireItem(db, ctx, itemId, 'view')
	const t = db
		.select()
		.from(transfers)
		.where(and(eq(transfers.itemId, itemId), eq(transfers.status, 'pending')))
		.get()
	if (!t) return null
	if (!atLeast(level, 'manage') && !isRecipient(ctx, t) && t.createdBy !== ctx.userId) return null
	const [row] = toRows(db, ctx, [t])
	if (!row) return null
	const { item: _item, ...rest } = row
	return rest
}

export function getTransferOverview(db: AppDb, ctx: AuthCtx): TransferOverview {
	const gids = [...ctx.groupIds]
	const toMe = or(
		and(eq(transfers.toOwnerKind, 'user'), eq(transfers.toOwnerId, ctx.userId)),
		gids.length
			? and(eq(transfers.toOwnerKind, 'group'), inArray(transfers.toOwnerId, gids))
			: undefined,
	) as SQL
	const list = (where: SQL) =>
		db
			.select()
			.from(transfers)
			.where(and(eq(transfers.status, 'pending'), where))
			.orderBy(asc(transfers.createdAt), asc(transfers.id))
			.all()
	return {
		incoming: toRows(db, ctx, list(toMe)),
		outgoing: toRows(db, ctx, list(eq(transfers.createdBy, ctx.userId) as SQL)).filter(
			(r) => !r.toMe,
		),
	}
}
