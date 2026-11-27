// Server functions for the caller's own inbox. Logic: ./service.ts.
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { authMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import { listNotifications, markNotificationsRead, markReadInput, unreadCount } from './service'

/** NotificationPage (newest first). */
export const listNotificationsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ cursor: z.string().max(200).optional() }))
	.handler(({ context: { ctx }, data }) => listNotifications(itemsDb(), ctx, data))

/** { unread } for the header badge. */
export const unreadNotificationsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(({ context: { ctx } }) => ({ unread: unreadCount(itemsDb(), ctx) }))

/** Marks `ids` (or all) as read. Returns { unread }. */
export const markNotificationsReadFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(markReadInput)
	.handler(({ context: { ctx }, data }) => markNotificationsRead(itemsDb(), ctx, data))
