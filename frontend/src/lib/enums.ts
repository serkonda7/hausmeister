// Single source of truth for shared picklists (mirrors backend/src/db/schema.ts).
// Import these in api.ts / format.ts instead of re-defining literals.

export const liquidityTierEnum = ['instant', 'days', 'weeks', 'months', 'locked'] as const
export type LiquidityTier = (typeof liquidityTierEnum)[number]

export const accountTypeEnum = [
	'checking',
	'savings',
	'broker',
	'cash',
	'crypto',
	'festgeld',
	'other',
] as const
export type AccountType = (typeof accountTypeEnum)[number]

export const directionEnum = ['inflow', 'outflow'] as const
export type Direction = (typeof directionEnum)[number]

export const frequencyEnum = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
export type Frequency = (typeof frequencyEnum)[number]

export const categoryKindEnum = ['income', 'expense'] as const
export type CategoryKind = (typeof categoryKindEnum)[number]
