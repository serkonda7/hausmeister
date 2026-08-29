import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Enums as text with check constraints (validated in app layer)
export const liquidityTierEnum = ['instant', 'days', 'weeks', 'months', 'locked'] as const
export type LiquidityTier = (typeof liquidityTierEnum)[number]

export const accountTypeEnum = [
	'checking',
	'savings',
	'broker',
	'cash',
	'crypto',
	'tagesgeld',
	'festgeld',
	'other',
] as const
export type AccountType = (typeof accountTypeEnum)[number]

export const riskLevelEnum = [1, 2, 3, 4, 5] as const

export const accounts = sqliteTable('accounts', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	type: text('type').notNull().$type<AccountType>(),
	institution: text('institution'),
	liquidityTier: text('liquidity_tier').notNull().$type<LiquidityTier>().default('instant'),
	balanceCents: integer('balance_cents').notNull().default(0),
	unlockAt: text('unlock_at'), // ISO date string, when locked funds become available
	notes: text('notes'),
	createdAt: text('created_at').notNull(),
})

export const pools = sqliteTable('pools', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	purpose: text('purpose'),
	// target allocation
	targetMinCents: integer('target_min_cents'),
	targetMaxCents: integer('target_max_cents'),
	targetPercent: integer('target_percent'), // 0-100
	// return / risk
	expectedReturnBps: integer('expected_return_bps'), // 500 = 5.00%
	riskLevel: integer('risk_level').$type<number>(), // 1-5
	volatilityBps: integer('volatility_bps'),
	horizonMonths: integer('horizon_months'),
	color: text('color'),
	createdAt: text('created_at').notNull(),
})

export const allocations = sqliteTable('allocations', {
	id: text('id').primaryKey(),
	poolId: text('pool_id')
		.notNull()
		.references(() => pools.id, { onDelete: 'cascade' }),
	accountId: text('account_id')
		.notNull()
		.references(() => accounts.id, { onDelete: 'cascade' }),
	amountCents: integer('amount_cents').notNull(),
	liquidityOverride: text('liquidity_override').$type<LiquidityTier>(),
	unlockAt: text('unlock_at'),
	createdAt: text('created_at').notNull(),
})

export const events = sqliteTable('events', {
	id: text('id').primaryKey(),
	title: text('title').notNull(),
	amountCents: integer('amount_cents').notNull(),
	direction: text('direction').notNull().$type<'inflow' | 'outflow'>(),
	date: text('date').notNull(), // ISO date (YYYY-MM-DD)
	isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
	frequency: text('frequency').$type<
		'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
	>(),
	recurringUntil: text('recurring_until'),
	poolId: text('pool_id').references(() => pools.id, { onDelete: 'set null' }),
	accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
	notes: text('notes'),
	createdAt: text('created_at').notNull(),
})

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Pool = typeof pools.$inferSelect
export type NewPool = typeof pools.$inferInsert
export type Allocation = typeof allocations.$inferSelect
export type NewAllocation = typeof allocations.$inferInsert
export type FinanceEvent = typeof events.$inferSelect
export type NewFinanceEvent = typeof events.$inferInsert
