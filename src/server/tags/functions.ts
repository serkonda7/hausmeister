// Server functions for tags. Attach/detach need `edit` on the item; rename,
// recolour, merge and delete are admin-only (checked again in ./service.ts).
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import {
	idSchema,
	mergeTagsInput,
	recolorTagInput,
	renameTagInput,
	tagAttachInput,
	tagDetachInput,
} from '~/lib/items/inputs'
import { authMiddleware, roleMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import {
	attachTag,
	deleteTag,
	detachTag,
	listTags,
	mergeTags,
	recolorTag,
	renameTag,
} from './service'

const admin = roleMiddleware('admin')

/** TagSummary[] with visible-item counts. */
export const listTagsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(({ context: { ctx } }) => listTags(itemsDb(), ctx))

/** Returns { version, tagId }. */
export const attachTagFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(tagAttachInput)
	.handler(({ context: { ctx }, data }) => attachTag(itemsDb(), ctx, data))

/** Returns { version }. */
export const detachTagFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(tagDetachInput)
	.handler(({ context: { ctx }, data }) => detachTag(itemsDb(), ctx, data))

export const renameTagFn = createServerFn({ method: 'POST' })
	.middleware([admin])
	.validator(renameTagInput)
	.handler(({ context: { ctx }, data }) => {
		renameTag(itemsDb(), ctx, data)
		return { ok: true as const }
	})

export const recolorTagFn = createServerFn({ method: 'POST' })
	.middleware([admin])
	.validator(recolorTagInput)
	.handler(({ context: { ctx }, data }) => {
		recolorTag(itemsDb(), ctx, data)
		return { ok: true as const }
	})

/** Returns { items } (number of items re-tagged). */
export const mergeTagsFn = createServerFn({ method: 'POST' })
	.middleware([admin])
	.validator(mergeTagsInput)
	.handler(({ context: { ctx }, data }) => mergeTags(itemsDb(), ctx, data))

/** Returns { items }. */
export const deleteTagFn = createServerFn({ method: 'POST' })
	.middleware([admin])
	.validator(z.object({ id: idSchema }))
	.handler(({ context: { ctx }, data }) => deleteTag(itemsDb(), ctx, data))
