// Input schemas for creating and updating item types, shared by the schema
// editor (client-side check) and the server functions.
import { z } from 'zod'
import { m } from '~/paraglide/messages'
import { fieldListSchema } from './fields'
import { isTypeIcon } from './icons'

export const TRACKING_MODES = ['individual', 'stock'] as const
export type TrackingMode = (typeof TRACKING_MODES)[number]

export const TYPE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/

const idSchema = z.string().min(1).max(64)

const common = {
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.types_error_name() })
		.max(80, { error: () => m.types_error_name() }),
	icon: z
		.string()
		.refine((v): boolean => isTypeIcon(v), { error: () => m.types_error_icon() })
		.nullable(),
	tracking: z.enum(TRACKING_MODES),
	parentId: idSchema.nullable(),
	fields: fieldListSchema,
}

export const createItemTypeInput = z.object({
	/** Stable English identifier; cannot be changed after creation. */
	key: z.string().regex(TYPE_KEY_PATTERN, { error: () => m.types_error_key() }),
	...common,
})
export type CreateItemTypeInput = z.infer<typeof createItemTypeInput>

export const updateItemTypeInput = z.object({
	id: idSchema,
	...common,
	/**
	 * The affected-item count from the migration preview the user confirmed.
	 * The update only applies a migration when this matches the current count.
	 */
	confirmAffected: z.number().int().min(0).optional(),
})
export type UpdateItemTypeInput = z.infer<typeof updateItemTypeInput>

export const typeIdInput = z.object({ id: idSchema })
export const archiveItemTypeInput = z.object({ id: idSchema, archived: z.boolean() })

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Suggests a key from a (German) name: "Elektrowerkzeug" -> "elektrowerkzeug". */
export function suggestKey(name: string): string {
	const s = name
		.toLowerCase()
		.replace(/[äöüß]/g, (c) => UMLAUTS[c] ?? c)
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/^[0-9_]+/, '')
		.slice(0, 48)
		.replace(/_+$/, '')
	return s
}
