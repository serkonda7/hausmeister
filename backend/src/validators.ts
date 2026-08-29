import * as v from 'valibot'

export const liquidityTierSchema = v.picklist(['instant', 'days', 'weeks', 'months', 'locked'])
export const accountTypeSchema = v.picklist([
	'checking',
	'savings',
	'broker',
	'cash',
	'crypto',
	'tagesgeld',
	'festgeld',
	'other',
])

export const accountCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	type: accountTypeSchema,
	institution: v.optional(v.string()),
	liquidityTier: liquidityTierSchema,
	balanceCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
	unlockAt: v.optional(v.string()),
	notes: v.optional(v.string()),
})

export const accountUpdateSchema = v.partial(accountCreateSchema)

export const poolCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	purpose: v.optional(v.string()),
	targetMinCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	targetMaxCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	targetPercent: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
	expectedReturnBps: v.optional(v.pipe(v.number(), v.integer())),
	riskLevel: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))),
	volatilityBps: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	horizonMonths: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	color: v.optional(v.string()),
})

export const poolUpdateSchema = v.partial(poolCreateSchema)

export const allocationCreateSchema = v.object({
	poolId: v.pipe(v.string(), v.minLength(1)),
	accountId: v.pipe(v.string(), v.minLength(1)),
	amountCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
	liquidityOverride: v.optional(liquidityTierSchema),
	unlockAt: v.optional(v.string()),
})

export const allocationUpdateSchema = v.partial(allocationCreateSchema)

export const eventCreateSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	amountCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
	direction: v.picklist(['inflow', 'outflow']),
	date: v.pipe(v.string(), v.minLength(1)), // ISO YYYY-MM-DD
	isRecurring: v.optional(v.boolean()),
	frequency: v.optional(v.picklist(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])),
	recurringUntil: v.optional(v.string()),
	poolId: v.optional(v.string()),
	accountId: v.optional(v.string()),
	notes: v.optional(v.string()),
})

export const eventUpdateSchema = v.partial(eventCreateSchema)
