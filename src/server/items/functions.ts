// Server functions for items. Logic, permission checks and events live in
// ./service.ts; these add auth (authMiddleware) and input validation.
// Errors: ItemsError codes (src/lib/items/errors.ts; itemsErrorText for German).
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import {
	changeItemTypeInput,
	changeOwnerInput,
	createItemInput,
	idSchema,
	itemRefInput,
	moveItemInput,
	principalInput,
	reassignItemsInput,
	setGrantInput,
	setItemStatusInput,
	setVisibilityInput,
	updateItemInput,
} from '~/lib/items/inputs'
import { authMiddleware, roleMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import { listPrincipals } from './principals'
import {
	changeItemOwner,
	changeItemType,
	createItem,
	deleteItem,
	getItem,
	listItemGrants,
	moveItem,
	reassignUserItems,
	removeItemGrant,
	resolveShortCode,
	setItemGrant,
	setItemStatus,
	setItemVisibility,
	updateItem,
} from './service'

/** Admin/member. Returns { id, shortCode, version }. */
export const createItemFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(createItemInput)
	.handler(({ context: { ctx }, data }) => createItem(itemsDb(), ctx, data))

/** ItemDetail (view). */
export const getItemFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ id: idSchema }))
	.handler(({ context: { ctx }, data }) => getItem(itemsDb(), ctx, data.id))

/** Short code (QR label, typed) -> { kind: "item" | "location", id }. */
export const resolveShortCodeFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ code: z.string().min(1).max(20) }))
	.handler(({ context: { ctx }, data }) => resolveShortCode(itemsDb(), ctx, data.code))

/** Patch at edit. Returns { version }. */
export const updateItemFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(updateItemInput)
	.handler(({ context: { ctx }, data }) => updateItem(itemsDb(), ctx, data))

/** Location / container at use. Returns { version }. */
export const moveItemFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(moveItemInput)
	.handler(({ context: { ctx }, data }) => moveItem(itemsDb(), ctx, data))

/** Status at use (gone statuses: manage). Returns { version }. */
export const setItemStatusFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(setItemStatusInput)
	.handler(({ context: { ctx }, data }) => setItemStatus(itemsDb(), ctx, data))

/** Edit. { status: "preview", plan, attributes } without confirm; { status: "saved", version } with. */
export const changeItemTypeFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(changeItemTypeInput)
	.handler(({ context: { ctx }, data }) => changeItemType(itemsDb(), ctx, data))

/** Manage. Returns { version, visibility }. */
export const changeItemOwnerFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(changeOwnerInput)
	.handler(({ context: { ctx }, data }) => changeItemOwner(itemsDb(), ctx, data))

/** Manage. Returns { version }. */
export const setItemVisibilityFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(setVisibilityInput)
	.handler(({ context: { ctx }, data }) => setItemVisibility(itemsDb(), ctx, data))

/** Manage. GrantRow[]. */
export const listItemGrantsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ itemId: idSchema }))
	.handler(({ context: { ctx }, data }) => listItemGrants(itemsDb(), ctx, data.itemId))

/** Manage. Adds or changes a grant; returns the item's GrantRow[]. */
export const setItemGrantFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(setGrantInput)
	.handler(({ context: { ctx }, data }) => setItemGrant(itemsDb(), ctx, data))

/** Manage. Returns the item's GrantRow[]. */
export const removeItemGrantFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(principalInput)
	.handler(({ context: { ctx }, data }) => removeItemGrant(itemsDb(), ctx, data))

/** Manage. */
export const deleteItemFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(itemRefInput)
	.handler(({ context: { ctx }, data }) => {
		deleteItem(itemsDb(), ctx, data)
		return { ok: true as const }
	})

/** Admin: all items of a user to the household or another user. Returns { count }. */
export const reassignUserItemsFn = createServerFn({ method: 'POST' })
	.middleware([roleMiddleware('admin')])
	.validator(reassignItemsInput)
	.handler(({ context: { ctx }, data }) => reassignUserItems(itemsDb(), ctx, data))

/** Admin/member: owner and grantee candidates (users, groups) for the item pickers. */
export const listPrincipalsFn = createServerFn({ method: 'GET' })
	.middleware([roleMiddleware('admin', 'member')])
	.handler(({ context: { ctx } }) => listPrincipals(itemsDb(), ctx))
