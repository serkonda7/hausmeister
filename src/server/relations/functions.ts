// Server functions for item relations. Rules: ./service.ts.
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { idSchema } from '~/lib/items/inputs'
import { relationInput } from '~/lib/relations/types'
import { authMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import { addItemRelation, listItemRelations, removeItemRelation } from './service'

const ok = { ok: true as const }

/** ItemRelations: the item's relations whose other item the caller can see. */
export const listItemRelationsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ itemId: idSchema }))
	.handler(({ context: { ctx }, data }) => listItemRelations(itemsDb(), ctx, data.itemId))

/** Both items visible, edit on one of them. */
export const addItemRelationFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(relationInput)
	.handler(({ context: { ctx }, data }) => {
		addItemRelation(itemsDb(), ctx, data)
		return ok
	})

export const removeItemRelationFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(relationInput)
	.handler(({ context: { ctx }, data }) => {
		removeItemRelation(itemsDb(), ctx, data)
		return ok
	})
