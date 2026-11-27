// Server functions for item types. Logic and permission checks live in
// ./service.ts (testable without a request); these only add auth and input validation.
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import {
	archiveItemTypeInput,
	createItemTypeInput,
	typeIdInput,
	updateItemTypeInput,
} from '~/lib/item-types/type-input'
import { authMiddleware, roleMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import {
	archiveItemType,
	createItemType,
	deleteItemType,
	getItemType,
	listActiveUsers,
	listItemTypes,
	previewItemTypeUpdate,
	updateItemType,
} from './service'

/** All types as a tree. Every signed-in user (guests included) may read types. */
export const listItemTypesFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ includeArchived: z.boolean().optional() }).optional())
	.handler(({ context: { ctx }, data }) =>
		listItemTypes(itemsDb(), ctx, { includeArchived: data?.includeArchived }),
	)

/** One type with own and effective (inherited) fields. */
export const getItemTypeFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(typeIdInput)
	.handler(({ context: { ctx }, data }) => getItemType(itemsDb(), ctx, data.id))

export const createItemTypeFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(createItemTypeInput)
	.handler(({ context: { ctx }, data }) => createItemType(itemsDb(), ctx, data))

/** Returns {status:"confirm", preview} when stored values would change (see service). */
export const updateItemTypeFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(updateItemTypeInput)
	.handler(({ context: { ctx }, data }) => updateItemType(itemsDb(), ctx, data))

export const previewItemTypeUpdateFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(updateItemTypeInput)
	.handler(({ context: { ctx }, data }) => previewItemTypeUpdate(itemsDb(), ctx, data))

export const archiveItemTypeFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(archiveItemTypeInput)
	.handler(({ context: { ctx }, data }) => {
		archiveItemType(itemsDb(), ctx, data)
		return { ok: true as const }
	})

export const deleteItemTypeFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(typeIdInput)
	.handler(({ context: { ctx }, data }) => {
		deleteItemType(itemsDb(), ctx, data)
		return { ok: true as const }
	})

/** Active users (id, display name) for the `user` field picker; admins and members. */
export const listPickerUsersFn = createServerFn({ method: 'GET' })
	.middleware([roleMiddleware('admin', 'member')])
	.handler(({ context: { ctx } }) => listActiveUsers(itemsDb(), ctx))
