// Server function for an item's history (redaction rules: ./service.ts).
import { createServerFn } from '@tanstack/solid-start'
import { historyInput } from '~/lib/items/inputs'
import { authMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import { getItemHistory } from './service'

/** HistoryPage, newest first. */
export const getItemHistoryFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(historyInput)
	.handler(({ context: { ctx }, data }) => getItemHistory(itemsDb(), ctx, data))
