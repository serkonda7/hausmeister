import * as v from 'valibot'

export const liquidityTierSchema = v.picklist(['instant', 'days', 'weeks', 'months', 'locked'])
export const accountTypeSchema = v.picklist([
	'checking',
	'savings',
	'broker',
	'cash',
	'crypto',
	'festgeld',
	'other',
])

export const accountCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	type: accountTypeSchema,
	institution: v.optional(v.nullable(v.string())),
	openingDate: v.optional(v.nullable(v.string())),
	openingBalanceCents: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	),
	iban: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(34)))),
	notes: v.optional(v.nullable(v.string())),
})

export const accountUpdateSchema = v.partial(accountCreateSchema)

export const poolCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	purpose: v.optional(v.nullable(v.string())),
	targetMinCents: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	targetMaxCents: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	targetPercent: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
	),
	expectedReturnBps: v.optional(v.nullable(v.pipe(v.number(), v.integer()))),
	riskLevel: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)))),
	volatilityBps: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	horizonMonths: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	color: v.optional(v.nullable(v.string())),
})

export const poolUpdateSchema = v.partial(poolCreateSchema)

export const allocationCreateSchema = v.object({
	poolId: v.pipe(v.string(), v.minLength(1)),
	accountId: v.pipe(v.string(), v.minLength(1)),
	amountCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
	liquidityOverride: v.optional(v.nullable(liquidityTierSchema)),
	unlockAt: v.optional(v.nullable(v.string())),
})

export const allocationUpdateSchema = v.partial(allocationCreateSchema)

export const eventCreateSchema = v.object({
	title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
	amountCents: v.pipe(v.number(), v.integer(), v.minValue(0)),
	direction: v.picklist(['inflow', 'outflow']),
	date: v.pipe(v.string(), v.minLength(1)), // ISO YYYY-MM-DD
	isRecurring: v.optional(v.nullable(v.boolean())),
	frequency: v.optional(
		v.nullable(v.picklist(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])),
	),
	recurringUntil: v.optional(v.nullable(v.string())),
	poolId: v.optional(v.nullable(v.string())),
	accountId: v.optional(v.nullable(v.string())),
	notes: v.optional(v.nullable(v.string())),
})

export const eventUpdateSchema = v.partial(eventCreateSchema)

// ---- Phase 1: ledger ----
export const categoryKindSchema = v.picklist(['income', 'expense'])

export const categoryCreateSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	kind: v.optional(v.nullable(categoryKindSchema)),
	color: v.optional(v.nullable(v.string())),
})

export const categoryUpdateSchema = v.partial(categoryCreateSchema)

const isoDateSchema = v.pipe(
	v.string(),
	v.minLength(1),
	v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected ISO date YYYY-MM-DD'),
)

export const transactionCreateSchema = v.object({
	accountId: v.pipe(v.string(), v.minLength(1)),
	date: isoDateSchema,
	payee: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	categoryId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	amountCents: v.pipe(v.number(), v.integer(), v.minValue(1)),
	direction: v.picklist(['inflow', 'outflow']),
	notes: v.optional(v.nullable(v.string())),
})

export const transactionUpdateSchema = v.partial(transactionCreateSchema)

export const transferCreateSchema = v.object({
	fromAccountId: v.pipe(v.string(), v.minLength(1)),
	toAccountId: v.pipe(v.string(), v.minLength(1)),
	amountCents: v.pipe(v.number(), v.integer(), v.minValue(1)),
	date: isoDateSchema,
	payee: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(200)))),
	categoryId: v.optional(v.nullable(v.pipe(v.string(), v.minLength(1)))),
	notes: v.optional(v.nullable(v.string())),
})
