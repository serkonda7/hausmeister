// Server functions for item lists, search, filter metadata and the item picker.
import { createServerFn } from '@tanstack/solid-start'
import { pickItemsInput, searchFiltersInput, searchItemsInput } from '~/lib/items/inputs'
import { authMiddleware } from '../auth/middleware'
import { pickItems, searchFacets, searchItems } from './query'
import { itemsDb } from './ready'

/** The one list query: ItemPage (rows, nextCursor, total, sort, mode). */
export const searchItemsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(searchItemsInput)
	.handler(({ context: { ctx }, data }) => searchItems(itemsDb(), ctx, data))

/** SearchFacets for the filter controls (same filters as searchItemsFn). */
export const searchFacetsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(searchFiltersInput)
	.handler(({ context: { ctx }, data }) => searchFacets(itemsDb(), ctx, data))

/** Item reference picker: PickedItem[] (max 20, visible, not gone). */
export const pickItemsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(pickItemsInput)
	.handler(({ context: { ctx }, data }) => pickItems(itemsDb(), ctx, data))
