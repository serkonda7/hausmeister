// Server functions for scanning and label sheets.
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { authMiddleware } from '../auth/middleware'
import { getEnv } from '../env'
import { getLabels, labelsInput } from '../labels/service'
import { itemsDb } from '../search/ready'
import { lookupCode } from './service'

/** A scanned or typed code -> CodeLookup (item, location, or matching items). */
export const lookupCodeFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ code: z.string().min(1).max(300) }))
	.handler(({ context: { ctx }, data }) => lookupCode(itemsDb(), ctx, data.code))

/** LabelSheet for the given items and locations (visible ones only). */
export const getLabelsFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(labelsInput)
	.handler(({ context: { ctx }, data }) => getLabels(itemsDb(), ctx, getEnv().ORIGIN, data))
