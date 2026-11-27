// Server functions for stock. Logic and low-stock alerts: ./service.ts.
import { createServerFn } from '@tanstack/solid-start'
import { adjustStockInput } from '~/lib/items/inputs'
import { authMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import { adjustStock } from './service'

/** Use. `delta` or `quantity` (a count) with a reason. Returns { quantity, version, lowStock }. */
export const adjustStockFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(adjustStockInput)
	.handler(({ context: { ctx }, data }) => adjustStock(itemsDb(), ctx, data))
