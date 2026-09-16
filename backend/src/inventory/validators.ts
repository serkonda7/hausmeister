// Validators for the inventory bounded context.
// SEPARATION: imports only from contracts + the inventory schema — never
// from finance (`../db/schema.ts`, `../validators.ts`).
import * as v from 'valibot'
import { assetStatusEnum } from '../db/schema-inventory'

export const assetStatusSchema = v.picklist([...assetStatusEnum])

export const isoDateSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO date YYYY-MM-DD'),
)

export const isoDateNullableSchema = v.optional(v.nullable(isoDateSchema))

export const locationCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	description: v.optional(v.nullable(v.string())),
})

export const locationUpdateSchema = v.partial(locationCreateSchema)

export const itemCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	sku: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(100)))),
	category: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(100)))),
	quantity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	unit: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(20)))),
	locationId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	lowStockAt: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	notes: v.optional(v.nullable(v.string())),
})

export const itemUpdateSchema = v.partial(itemCreateSchema)

// Stock adjustment: positive restocks, negative consumes. The route clamps
// at zero and rejects deltas that would drive quantity below zero.
export const itemAdjustSchema = v.object({
	delta: v.pipe(v.number(), v.integer(), v.minValue(-1_000_000_000), v.maxValue(1_000_000_000)),
})

export const assetCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	serial: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(100)))),
	status: v.optional(assetStatusSchema),
	locationId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	purchaseDate: isoDateNullableSchema,
	purchasePriceCents: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	warrantyUntil: isoDateNullableSchema,
	notes: v.optional(v.nullable(v.string())),
})

export const assetUpdateSchema = v.partial(assetCreateSchema)
