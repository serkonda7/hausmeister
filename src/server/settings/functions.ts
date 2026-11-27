// Server functions for the household settings singleton. Reading only needs a
// session; writing is admin-only (enforced by the service and unit-tested).
// Service validation throws HttpError codes mapped in src/lib/error-text.ts.
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { authMiddleware } from '../auth/middleware'
import { getDb } from '../db/client'
import { getSettings, updateSettings } from './service'

export const getSettingsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(() => getSettings(getDb()))

export const updateSettingsFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(
		z.object({
			householdName: z.string().max(200),
			currency: z.string().max(20),
		}),
	)
	.handler(({ context: { ctx }, data }) => updateSettings(getDb(), ctx, data))
