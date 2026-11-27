// Items: create, read, update, move, status, type change, owner, visibility,
// grants, delete, bulk reassignment. Independent of the request (take `db`,
// `ctx`); ./functions.ts wraps these as server functions.
//
// Levels needed (DESIGN §3.2):
//   view    getItem, history
//   use     moveItem, setItemStatus (except gone statuses, see below)
//   edit    updateItem (fields, price, attributes, tags), changeItemType, tags
//   manage  changeItemOwner, setItemVisibility, grants, deleteItem, and setting
//           or leaving a gone status (archived, given_away, sold, disposed):
//           those take the item out of everyone's lists, like a delete/transfer.
// Every write checks `version` (VERSION_CONFLICT on mismatch), bumps it,
// writes an event with a field diff and keeps items_fts in step, all in one
// transaction. Invisible items are ITEM_NOT_FOUND, exactly like missing ones.
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { diffFields, type FieldDiff } from '../../lib/diff'
import { collectReferences } from '../../lib/item-types/fields'
import { MANAGE_STATUSES } from '../../lib/items/constants'
import {
	type ChangeItemTypeInput,
	type ChangeOwnerInput,
	type CreateItemInput,
	changeItemTypeInput,
	changeOwnerInput,
	createItemInput,
	itemRefInput,
	type MoveItemInput,
	moveItemInput,
	principalInput,
	type ReassignItemsInput,
	type RemoveGrantInput,
	reassignItemsInput,
	type SetGrantInput,
	type SetItemStatusInput,
	type SetVisibilityInput,
	setGrantInput,
	setItemStatusInput,
	setVisibilityInput,
	type UpdateItemInput,
	updateItemInput,
} from '../../lib/items/inputs'
import type {
	GrantRow,
	ItemDetail,
	ItemRow,
	JsonObject,
	ShortCodeTarget,
	TypeChangeResult,
} from '../../lib/items/types'
import { normalizeSearchText } from '../../lib/normalize'
import { normalizeShortCode } from '../../lib/short-code'
import { m } from '../../paraglide/messages'
import { enqueueBlobGc } from '../attachments/gc'
import {
	atLeast,
	can,
	canChangeOwner,
	filterAttachments,
	type Owner,
	serializeItem,
	validateGrantPrincipal,
	validateOwner,
	visibleItemsWhere,
} from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb, DbOrTx } from '../db/client'
import {
	attachments,
	groups,
	type Item,
	itemGrants,
	items,
	itemTypes,
	locations,
	settings,
	users,
} from '../db/schema'
import { ATTRIBUTE_PREFIX, recordItemEvent } from '../history/record'
import {
	effectiveFieldsForType,
	planItemTypeChange,
	prepareItemAttributes,
} from '../item-types/service'
import { canSeeLocation, visibleLocationIds } from '../locations/visibility'
import { reindexItems, removeFromIndex } from '../search/indexer'
import { ownerRefs, tagsOfItems } from '../search/query'
import { recordStockChange } from '../stock/service'
import { findOrCreateTags, itemTagNames, replaceItemTags } from '../tags/core'
import { assertVersion, requireItem, uniqueShortCode, writeVersioned } from './access'
import { forbidden, ItemsError, parseInput } from './errors'
import { itemPath, syncDescendantLocations, visibleItemIds, wouldContainCycle } from './placement'
import { hiddenReferenceIds, restoreHiddenReferences, stripHiddenReferences } from './references'

const asDb = (tx: DbOrTx) => tx as unknown as AppDb

// --- Helpers -----------------------------------------------------------------------

function requireType(db: DbOrTx, typeId: string, allowArchived = false) {
	const t = db.select().from(itemTypes).where(eq(itemTypes.id, typeId)).get()
	if (!t) throw new ItemsError(422, 'TYPE_NOT_FOUND')
	if (t.archivedAt && !allowArchived) throw new ItemsError(422, 'TYPE_ARCHIVED')
	return t
}

function householdCurrency(db: DbOrTx): string {
	return db.select({ c: settings.currency }).from(settings).get()?.c ?? 'EUR'
}

/**
 * Validates attributes against the type (prepareItemAttributes) and checks
 * that every newly referenced item is visible to the caller. References kept
 * unchanged from `previous` are not re-checked (another user may have set them).
 */
function validateAttributes(
	db: DbOrTx,
	ctx: AuthCtx,
	typeId: string,
	attributes: Record<string, unknown>,
	previous: Record<string, unknown>,
	carry: Record<string, unknown> = previous,
): Record<string, unknown> {
	const r = prepareItemAttributes(asDb(db), { typeId, attributes, previous: carry })
	if (!r.ok) throw new ItemsError(422, 'ATTRIBUTES_INVALID', JSON.stringify(r.errors))
	const fields = effectiveFieldsForType(asDb(db), typeId)
	const errors: Record<string, string> = {}
	const before = collectReferences(fields, previous).itemIds
	const fresh = collectReferences(fields, r.attributes).itemIds.filter(
		(id) => !before.includes(id),
	)
	if (fresh.length) {
		const visible = visibleItemIds(db, ctx, fresh)
		for (const f of fields) {
			if (f.kind !== 'item' || f.hidden) continue
			const v = r.attributes[f.key]
			const list = Array.isArray(v) ? v : v === undefined ? [] : [v]
			if (list.some((id) => fresh.includes(String(id)) && !visible.has(String(id))))
				errors[f.key] = m.items_error_reference_unknown()
		}
	}
	if (Object.keys(errors).length)
		throw new ItemsError(422, 'ATTRIBUTES_INVALID', JSON.stringify(errors))
	return r.attributes
}

/** Members may give items to themselves, the household or their own groups; admins to anyone valid. */
function assertOwnerAllowed(ctx: AuthCtx, owner: Owner) {
	if (ctx.role === 'admin') return
	if (owner.ownerKind === 'household') return
	if (owner.ownerKind === 'user' && owner.ownerId === ctx.userId) return
	if (owner.ownerKind === 'group' && ctx.groupIds.has(owner.ownerId)) return
	throw new ItemsError(403, 'OWNER_NOT_ALLOWED')
}

function checkedOwner(
	db: DbOrTx,
	input: { ownerKind: Owner['ownerKind']; ownerId?: string | null },
) {
	const r = validateOwner(asDb(db), input)
	if (!r.ok) throw new ItemsError(422, 'OWNER_INVALID', r.error)
	return r.value
}

type Placement = { locationId: string | null; containerItemId: string | null }

/** Where the item goes; checks container visibility and cycles, location existence. */
function resolvePlacement(
	db: DbOrTx,
	ctx: AuthCtx,
	itemId: string | null,
	input: { locationId?: string | null; containerItemId?: string | null },
	current: Placement,
): Placement {
	if (input.containerItemId) {
		const cid = input.containerItemId
		if (!visibleItemIds(db, ctx, [cid]).has(cid))
			throw new ItemsError(422, 'CONTAINER_NOT_FOUND')
		if (itemId && wouldContainCycle(db, itemId, cid))
			throw new ItemsError(409, 'CONTAINER_CYCLE')
		const c = db
			.select({ locationId: items.locationId })
			.from(items)
			.where(eq(items.id, cid))
			.get()
		return { containerItemId: cid, locationId: c?.locationId ?? null }
	}
	if (input.locationId !== undefined || input.containerItemId === null) {
		const lid = input.locationId === undefined ? current.locationId : input.locationId
		if (lid) {
			const exists = db
				.select({ id: locations.id })
				.from(locations)
				.where(eq(locations.id, lid))
				.get()
			if (!exists || !canSeeLocation(visibleLocationIds(db, ctx), lid))
				throw new ItemsError(422, 'LOCATION_NOT_FOUND')
		}
		return { containerItemId: null, locationId: lid }
	}
	return current
}

/** Diff of base fields plus "attributes.<key>" entries. */
function itemDiff(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	attrsBefore?: Record<string, unknown>,
	attrsAfter?: Record<string, unknown>,
): FieldDiff {
	const out: FieldDiff = diffFields(before, after)
	if (attrsBefore && attrsAfter)
		for (const [k, v] of Object.entries(diffFields(attrsBefore, attrsAfter)))
			out[`${ATTRIBUTE_PREFIX}${k}`] = v
	return out
}

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
	Object.fromEntries(keys.map((k) => [k, o[k]])) as Pick<T, K>

// --- Create --------------------------------------------------------------------------

export function createItem(
	db: AppDb,
	ctx: AuthCtx,
	raw: CreateItemInput,
): { id: string; shortCode: string; version: number } {
	if (!can(ctx, 'items.create')) throw forbidden()
	const input = parseInput(createItemInput, raw)
	return db.transaction((tx) => {
		requireType(tx, input.typeId)
		const owner = checkedOwner(tx, input.owner ?? { ownerKind: 'household' })
		assertOwnerAllowed(ctx, owner)
		const visibility = input.visibility ?? 'household'
		if (owner.ownerKind === 'household' && visibility === 'private')
			throw new ItemsError(422, 'HOUSEHOLD_PRIVATE')
		const place = resolvePlacement(tx, ctx, null, input, {
			locationId: null,
			containerItemId: null,
		})
		const attributes = validateAttributes(tx, ctx, input.typeId, input.attributes ?? {}, {})
		const tagRefs = findOrCreateTags(tx, ctx, input.tags ?? [])
		const priceCents = input.priceCents ?? null
		const currency = input.currency ?? (priceCents !== null ? householdCurrency(tx) : null)
		const shortCode = uniqueShortCode(tx)
		const row = tx
			.insert(items)
			.values({
				typeId: input.typeId,
				name: input.name,
				nameSort: normalizeSearchText(input.name),
				description: input.description ?? null,
				ownerKind: owner.ownerKind,
				ownerId: owner.ownerId,
				visibility,
				locationId: place.locationId,
				containerItemId: place.containerItemId,
				quantity: input.quantity ?? 1,
				unit: input.unit ?? null,
				minQuantity: input.minQuantity ?? null,
				status: input.status ?? 'available',
				condition: input.condition ?? null,
				acquiredOn: input.acquiredOn ?? null,
				priceCents,
				currency,
				barcode: input.barcode ?? null,
				shortCode,
				attributes,
				createdBy: ctx.userId,
			})
			.returning()
			.get()
		replaceItemTags(
			tx,
			row.id,
			tagRefs.map((t) => t.id),
		)
		const snapshot = pick(row, DIFF_KEYS)
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.created',
			itemId: row.id,
			diff: {
				...itemDiff({}, snapshot, {}, attributes),
				...(tagRefs.length
					? { tags: { from: null, to: tagRefs.map((t) => t.name).sort() } }
					: {}),
			},
		})
		reindexItems(tx, [row.id])
		return { id: row.id, shortCode, version: row.version }
	})
}

const DIFF_KEYS = [
	'typeId',
	'name',
	'description',
	'ownerKind',
	'ownerId',
	'visibility',
	'locationId',
	'containerItemId',
	'quantity',
	'unit',
	'minQuantity',
	'status',
	'condition',
	'acquiredOn',
	'priceCents',
	'currency',
	'barcode',
	'shortCode',
] as const satisfies readonly (keyof Item)[]

// --- Read ------------------------------------------------------------------------------

export function getItem(db: AppDb, ctx: AuthCtx, id: string): ItemDetail {
	const { item, level } = requireItem(db, ctx, id, 'view')
	const type = requireType(db, item.typeId, true)
	const effectiveFields = effectiveFieldsForType(db, item.typeId)
	const path = itemPath(db, ctx, item)
	const containerVisible =
		!!item.containerItemId &&
		visibleItemIds(db, ctx, [item.containerItemId]).has(item.containerItemId)
	const contentsCount =
		db
			.select({ n: count() })
			.from(items)
			.where(and(eq(items.containerItemId, item.id), visibleItemsWhere(ctx)))
			.get()?.n ?? 0
	const atts = db
		.select()
		.from(attachments)
		.where(eq(attachments.itemId, item.id))
		.orderBy(asc(attachments.sort), asc(attachments.createdAt))
		.all()

	// Names for user/item references (all keys, legacy included; items only if visible).
	const refUsers = new Set<string>()
	const refItems = new Set<string>()
	const kindOf = new Map(effectiveFields.map((f) => [f.key, f.kind]))
	for (const [k, v] of Object.entries(item.attributes ?? {})) {
		const kind = kindOf.get(k)
		if (kind !== 'user' && kind !== 'item') continue
		for (const x of Array.isArray(v) ? v : [v])
			if (typeof x === 'string') (kind === 'user' ? refUsers : refItems).add(x)
	}
	const userNames: Record<string, string> = {}
	if (refUsers.size)
		for (const u of db
			.select({ id: users.id, n: users.displayName })
			.from(users)
			.where(inArray(users.id, [...refUsers]))
			.all())
			userNames[u.id] = u.n
	const itemNames: Record<string, string> = {}
	const visibleRefs = visibleItemIds(db, ctx, [...refItems])
	if (visibleRefs.size)
		for (const r of db
			.select({ id: items.id, n: items.name })
			.from(items)
			.where(inArray(items.id, [...visibleRefs]))
			.all())
			itemNames[r.id] = r.n

	// Ids of referenced items the caller cannot see never leave the server.
	const attrs = item.attributes ?? {}
	const stripped = stripHiddenReferences(
		effectiveFields,
		attrs,
		hiddenReferenceIds(db, ctx, effectiveFields, attrs),
	)

	const { nameSort: _ns, ...rest } = item
	const row: ItemRow = {
		...rest,
		attributes: stripped.attributes as JsonObject,
		containerItemId: containerVisible ? item.containerItemId : null,
	}
	return {
		item: serializeItem(row, level),
		type: {
			id: type.id,
			name: type.name,
			icon: type.icon,
			tracking: type.tracking,
			archived: !!type.archivedAt,
			effectiveFields,
		},
		owner: ownerRefs(db, [item])(item),
		tags: tagsOfItems(db, [item.id]).get(item.id) ?? [],
		path,
		contentsCount,
		attachments: filterAttachments(atts, level),
		references: { users: userNames, items: itemNames },
		hiddenReferences: stripped.hiddenReferences,
		permissions: {
			canUse: atLeast(level, 'use'),
			canEdit: atLeast(level, 'edit'),
			canManage: atLeast(level, 'manage'),
			canChangeOwner: canChangeOwner(ctx, item),
			canTransfer: atLeast(level, 'manage'),
		},
		grants: atLeast(level, 'manage') ? grantRows(db, item.id) : null,
	}
}

/** QR label / typed code -> the item or location (404 when invisible or unknown). */
export function resolveShortCode(db: AppDb, ctx: AuthCtx, code: string): ShortCodeTarget {
	const c = normalizeShortCode(code)
	const it = db
		.select({ id: items.id })
		.from(items)
		.where(and(eq(items.shortCode, c), visibleItemsWhere(ctx)))
		.get()
	if (it) return { kind: 'item', id: it.id }
	const loc = db
		.select({ id: locations.id })
		.from(locations)
		.where(eq(locations.shortCode, c))
		.get()
	if (loc && canSeeLocation(visibleLocationIds(db, ctx), loc.id))
		return { kind: 'location', id: loc.id }
	throw new ItemsError(404, 'SHORT_CODE_NOT_FOUND')
}

// --- Update (edit) ---------------------------------------------------------------------

const EDIT_KEYS = [
	'name',
	'description',
	'quantity',
	'unit',
	'minQuantity',
	'condition',
	'acquiredOn',
	'priceCents',
	'currency',
	'barcode',
] as const

export function updateItem(db: AppDb, ctx: AuthCtx, raw: UpdateItemInput): { version: number } {
	const input = parseInput(updateItemInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.id, 'edit')
		assertVersion(item, input.version)
		const next: Record<string, unknown> = {}
		for (const k of EDIT_KEYS) if (input[k] !== undefined) next[k] = input[k]
		if (input.priceCents !== undefined && input.currency === undefined) {
			if (input.priceCents === null) next.currency = null
			else if (!item.currency) next.currency = householdCurrency(tx)
		}
		const before = pick(item, EDIT_KEYS)
		const after = { ...before, ...next }
		const previous = item.attributes ?? {}
		let attrsAfter = previous
		if (input.attributes !== undefined) {
			// The client never saw references to items hidden from the caller; keep them.
			const fields = effectiveFieldsForType(asDb(tx), item.typeId)
			const hidden = hiddenReferenceIds(tx, ctx, fields, previous)
			const sent = restoreHiddenReferences(fields, input.attributes, previous, hidden)
			attrsAfter = validateAttributes(tx, ctx, item.typeId, sent, previous)
		}
		const diff = itemDiff(before, after, item.attributes ?? {}, attrsAfter)

		let tagChange: { from: string[]; to: string[] } | null = null
		let tagIds: string[] | null = null
		if (input.tags !== undefined) {
			const fromNames = itemTagNames(tx, item.id)
			const refs = findOrCreateTags(tx, ctx, input.tags)
			const toNames = refs.map((t) => t.name).sort()
			if (fromNames.join('\u0000') !== toNames.join('\u0000')) {
				tagChange = { from: fromNames, to: toNames }
				tagIds = refs.map((t) => t.id)
			}
		}
		if (Object.keys(diff).length === 0 && !tagChange) return { version: item.version }

		const set: Partial<Item> = { ...(next as Partial<Item>), attributes: attrsAfter }
		if (next.name !== undefined) set.nameSort = normalizeSearchText(String(next.name))
		const version = writeVersioned(tx, item.id, item.version, set)
		if (tagIds) replaceItemTags(tx, item.id, tagIds)
		if (diff.quantity || diff.minQuantity)
			recordStockChange(
				tx,
				ctx,
				{ ...item, unit: (after.unit as string | null) ?? null },
				{ quantity: item.quantity, minQuantity: item.minQuantity },
				{
					quantity: after.quantity as number,
					minQuantity: after.minQuantity as number | null,
				},
				'edited',
			)
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.updated',
			itemId: item.id,
			diff: { ...diff, ...(tagChange ? { tags: tagChange } : {}) },
		})
		reindexItems(tx, [item.id])
		return { version }
	})
}

// --- Move and status (use) --------------------------------------------------------------

export function moveItem(db: AppDb, ctx: AuthCtx, raw: MoveItemInput): { version: number } {
	const input = parseInput(moveItemInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.id, 'use')
		assertVersion(item, input.version)
		const current = { locationId: item.locationId, containerItemId: item.containerItemId }
		const place = resolvePlacement(tx, ctx, item.id, input, current)
		const diff = diffFields(current, place)
		if (Object.keys(diff).length === 0) return { version: item.version }
		const version = writeVersioned(tx, item.id, item.version, place)
		if (place.locationId !== item.locationId)
			syncDescendantLocations(tx, item.id, place.locationId)
		recordItemEvent(tx, { actorId: ctx.userId, action: 'item.moved', itemId: item.id, diff })
		return { version }
	})
}

export function setItemStatus(
	db: AppDb,
	ctx: AuthCtx,
	raw: SetItemStatusInput,
): { version: number } {
	const input = parseInput(setItemStatusInput, raw)
	return db.transaction((tx) => {
		const { item, level } = requireItem(tx, ctx, input.id, 'use')
		assertVersion(item, input.version)
		if (item.status === input.status) return { version: item.version }
		const needsManage =
			MANAGE_STATUSES.includes(input.status) || MANAGE_STATUSES.includes(item.status)
		if (needsManage && !atLeast(level, 'manage')) throw forbidden()
		const version = writeVersioned(tx, item.id, item.version, { status: input.status })
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.status_changed',
			itemId: item.id,
			diff: { status: { from: item.status, to: input.status } },
		})
		return { version }
	})
}

// --- Type change (edit) -----------------------------------------------------------------

/**
 * Without `confirm`: the preview (planItemTypeChange) and nothing is written.
 * With `confirm`: the planned attributes, plus any values in `attributes`, are
 * validated against the new type and saved.
 */
export function changeItemType(
	db: AppDb,
	ctx: AuthCtx,
	raw: ChangeItemTypeInput,
): TypeChangeResult {
	const input = parseInput(changeItemTypeInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.id, 'edit')
		assertVersion(item, input.version)
		requireType(tx, input.typeId)
		if (input.typeId === item.typeId) return { status: 'saved', version: item.version }
		const old = item.attributes ?? {}
		const plan = planItemTypeChange(asDb(tx), { attributes: old, toTypeId: input.typeId })
		if (!input.confirm) {
			const { attributes, ...summary } = plan
			const fields = effectiveFieldsForType(asDb(tx), input.typeId)
			const shown = stripHiddenReferences(
				fields,
				attributes,
				hiddenReferenceIds(tx, ctx, fields, attributes),
			).attributes
			return { status: 'preview', plan: summary, attributes: shown as JsonObject }
		}
		const merged = { ...plan.attributes, ...(input.attributes ?? {}) }
		const attributes = validateAttributes(tx, ctx, input.typeId, merged, old, plan.attributes)
		const version = writeVersioned(tx, item.id, item.version, {
			typeId: input.typeId,
			attributes,
		})
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.type_changed',
			itemId: item.id,
			diff: {
				...itemDiff({ typeId: item.typeId }, { typeId: input.typeId }, old, attributes),
				removed: plan.removed,
			},
		})
		reindexItems(tx, [item.id])
		return { status: 'saved', version }
	})
}

// --- Owner, visibility (manage) -------------------------------------------------------

/**
 * Only an admin or the item's direct user owner may change the owner
 * (`canChangeOwner`): `manage` from a grant or a shared group is not enough.
 * The owner may give it to the household or one of their groups; an admin to
 * any active non-guest user or any group. Becoming household-owned makes the
 * item household-visible (it cannot be private).
 */
export function changeItemOwner(
	db: AppDb,
	ctx: AuthCtx,
	raw: ChangeOwnerInput,
): { version: number; visibility: Item['visibility'] } {
	const input = parseInput(changeOwnerInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.id, 'manage')
		if (!canChangeOwner(ctx, item)) throw forbidden()
		assertVersion(item, input.version)
		const owner = checkedOwner(tx, input.owner)
		assertOwnerAllowed(ctx, owner)
		const visibility = owner.ownerKind === 'household' ? 'household' : item.visibility
		const before = {
			ownerKind: item.ownerKind,
			ownerId: item.ownerId,
			visibility: item.visibility,
		}
		const after = { ...owner, visibility }
		const diff = diffFields(before, after)
		if (Object.keys(diff).length === 0) return { version: item.version, visibility }
		const version = writeVersioned(tx, item.id, item.version, after)
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.owner_changed',
			itemId: item.id,
			diff,
		})
		return { version, visibility }
	})
}

export function setItemVisibility(
	db: AppDb,
	ctx: AuthCtx,
	raw: SetVisibilityInput,
): { version: number } {
	const input = parseInput(setVisibilityInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.id, 'manage')
		assertVersion(item, input.version)
		if (item.ownerKind === 'household' && input.visibility === 'private')
			throw new ItemsError(422, 'HOUSEHOLD_PRIVATE')
		if (item.visibility === input.visibility) return { version: item.version }
		const version = writeVersioned(tx, item.id, item.version, { visibility: input.visibility })
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.visibility_changed',
			itemId: item.id,
			diff: { visibility: { from: item.visibility, to: input.visibility } },
		})
		return { version }
	})
}

// --- Grants (manage) ---------------------------------------------------------------------

function grantRows(db: DbOrTx, itemId: string): GrantRow[] {
	const rows = db.select().from(itemGrants).where(eq(itemGrants.itemId, itemId)).all()
	const uids = rows.filter((g) => g.principalKind === 'user').map((g) => g.principalId)
	const gids = rows.filter((g) => g.principalKind === 'group').map((g) => g.principalId)
	const us = new Map(
		uids.length
			? db
					.select({ id: users.id, n: users.displayName, role: users.role })
					.from(users)
					.where(inArray(users.id, uids))
					.all()
					.map((u) => [u.id, u])
			: [],
	)
	const gs = new Map(
		gids.length
			? db
					.select({ id: groups.id, n: groups.name })
					.from(groups)
					.where(inArray(groups.id, gids))
					.all()
					.map((g) => [g.id, g.n])
			: [],
	)
	return rows
		.map((g) => ({
			principalKind: g.principalKind,
			principalId: g.principalId,
			level: g.level,
			name:
				(g.principalKind === 'user' ? us.get(g.principalId)?.n : gs.get(g.principalId)) ??
				m.items_owner_unknown(),
			isGuest: g.principalKind === 'user' && us.get(g.principalId)?.role === 'guest',
		}))
		.sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

export function listItemGrants(db: AppDb, ctx: AuthCtx, itemId: string): GrantRow[] {
	requireItem(db, ctx, itemId, 'manage')
	return grantRows(db, itemId)
}

/** Adds or changes a grant. Guests can be granted at most `use` (their role ceiling). */
export function setItemGrant(db: AppDb, ctx: AuthCtx, raw: SetGrantInput): GrantRow[] {
	const input = parseInput(setGrantInput, raw)
	return db.transaction((tx) => {
		requireItem(tx, ctx, input.itemId, 'manage')
		const r = validateGrantPrincipal(asDb(tx), input)
		if (!r.ok) throw new ItemsError(422, 'GRANT_INVALID', r.error)
		if (input.principalKind === 'user' && !atLeast('use', input.level)) {
			const u = tx
				.select({ role: users.role })
				.from(users)
				.where(eq(users.id, input.principalId))
				.get()
			if (u?.role === 'guest') throw new ItemsError(422, 'GRANT_ABOVE_CEILING')
		}
		const key = and(
			eq(itemGrants.itemId, input.itemId),
			eq(itemGrants.principalKind, input.principalKind),
			eq(itemGrants.principalId, input.principalId),
		)
		const prev = tx.select({ level: itemGrants.level }).from(itemGrants).where(key).get()
		if (prev?.level === input.level) return grantRows(tx, input.itemId)
		if (prev) tx.update(itemGrants).set({ level: input.level }).where(key).run()
		else tx.insert(itemGrants).values(input).run()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.grant_set',
			itemId: input.itemId,
			diff: {
				principalKind: input.principalKind,
				principalId: input.principalId,
				level: { from: prev?.level ?? null, to: input.level },
			},
		})
		return grantRows(tx, input.itemId)
	})
}

export function removeItemGrant(db: AppDb, ctx: AuthCtx, raw: RemoveGrantInput): GrantRow[] {
	const input = parseInput(principalInput, raw)
	return db.transaction((tx) => {
		requireItem(tx, ctx, input.itemId, 'manage')
		const key = and(
			eq(itemGrants.itemId, input.itemId),
			eq(itemGrants.principalKind, input.principalKind),
			eq(itemGrants.principalId, input.principalId),
		)
		const prev = tx.select({ level: itemGrants.level }).from(itemGrants).where(key).get()
		if (!prev) return grantRows(tx, input.itemId)
		tx.delete(itemGrants).where(key).run()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.grant_removed',
			itemId: input.itemId,
			diff: {
				principalKind: input.principalKind,
				principalId: input.principalId,
				level: { from: prev.level, to: null },
			},
		})
		return grantRows(tx, input.itemId)
	})
}

// --- Delete (manage) ----------------------------------------------------------------------

/**
 * Deletes the item (grants, tags and attachment rows cascade; events stay).
 * Items inside it stay where the container was, outside any container.
 */
export function deleteItem(db: AppDb, ctx: AuthCtx, raw: { id: string; version: number }) {
	const input = parseInput(itemRefInput, raw)
	db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.id, 'manage')
		assertVersion(item, input.version)
		const inside = tx
			.select({ id: items.id, version: items.version })
			.from(items)
			.where(eq(items.containerItemId, item.id))
			.all()
		for (const c of inside) {
			writeVersioned(tx, c.id, c.version, { containerItemId: null })
			recordItemEvent(tx, {
				actorId: ctx.userId,
				action: 'item.moved',
				itemId: c.id,
				diff: { containerItemId: { from: item.id, to: null }, reason: 'container_deleted' },
			})
		}
		// Attachment rows cascade; their files are garbage-collected by the attachments job.
		const shas = tx
			.select({ sha: attachments.sha256 })
			.from(attachments)
			.where(eq(attachments.itemId, item.id))
			.all()
			.map((r) => r.sha)
		tx.delete(items).where(eq(items.id, item.id)).run()
		enqueueBlobGc(tx, shas)
		removeFromIndex(tx, [item.id])
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.deleted',
			itemId: item.id,
			diff: pick(item, ['name', 'shortCode', 'typeId', 'ownerKind', 'ownerId']),
		})
	})
}

// --- Bulk reassignment (admin, DESIGN §3.6) ----------------------------------------------

/** Gives every item owned by `fromUserId` to the household or another user. */
export function reassignUserItems(
	db: AppDb,
	ctx: AuthCtx,
	raw: ReassignItemsInput,
): { count: number } {
	if (ctx.role !== 'admin') throw forbidden()
	const input = parseInput(reassignItemsInput, raw)
	return db.transaction((tx) => {
		const from = tx
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, input.fromUserId))
			.get()
		if (!from) throw new ItemsError(422, 'OWNER_INVALID', 'USER_NOT_FOUND')
		const owner = checkedOwner(tx, input.to)
		if (owner.ownerKind === 'user' && owner.ownerId === input.fromUserId)
			throw new ItemsError(422, 'OWNER_INVALID', 'SAME_USER')
		const owned = tx
			.select()
			.from(items)
			.where(and(eq(items.ownerKind, 'user'), eq(items.ownerId, input.fromUserId)))
			.all()
		for (const it of owned) {
			const visibility = owner.ownerKind === 'household' ? 'household' : it.visibility
			const after = { ...owner, visibility }
			writeVersioned(tx, it.id, it.version, after)
			recordItemEvent(tx, {
				actorId: ctx.userId,
				action: 'item.owner_changed',
				itemId: it.id,
				diff: {
					...diffFields(
						{ ownerKind: it.ownerKind, ownerId: it.ownerId, visibility: it.visibility },
						after,
					),
					reason: 'reassign',
				},
			})
		}
		return { count: owned.length }
	})
}
