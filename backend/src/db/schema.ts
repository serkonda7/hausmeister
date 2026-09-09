import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Enums as text with check constraints (validated in app layer)
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

export const riskLevelEnum = [1, 2, 3, 4, 5] as const

export const directionEnum = ['inflow', 'outflow'] as const
export type Direction = (typeof directionEnum)[number]

export const frequencyEnum = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
export type Frequency = (typeof frequencyEnum)[number]

export const accounts = sqliteTable('accounts', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	type: text('type').notNull().$type<AccountType>(),
	institution: text('institution'),
	openingDate: text('opening_date'), // ISO date (YYYY-MM-DD)
	openingBalanceCents: integer('opening_balance_cents'),
	iban: text('iban'),
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
	direction: text('direction').notNull().$type<Direction>(),
	date: text('date').notNull(), // ISO date (YYYY-MM-DD)
	isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
	frequency: text('frequency').$type<Frequency>(),
	recurringUntil: text('recurring_until'),
	poolId: text('pool_id').references(() => pools.id, { onDelete: 'set null' }),
	accountId: text('account_id').references(() => accounts.id, { onDelete: 'set null' }),
	notes: text('notes'),
	createdAt: text('created_at').notNull(),
})

// ---- Phase 1: ledger ----
export const categoryKindEnum = ['income', 'expense'] as const
export type CategoryKind = (typeof categoryKindEnum)[number]

export const categories = sqliteTable('categories', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	kind: text('kind').$type<CategoryKind>(), // null = both
	color: text('color'),
	createdAt: text('created_at').notNull(),
})

export const transactions = sqliteTable(
	'transactions',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		date: text('date').notNull(), // ISO date (YYYY-MM-DD)
		payee: text('payee'),
		categoryId: text('category_id').references(() => categories.id, {
			onDelete: 'set null',
		}),
		amountCents: integer('amount_cents').notNull(), // >= 0, see direction
		direction: text('direction').notNull().$type<Direction>(),
		// paired account-transfer legs share a transferId; null = plain transaction
		transferId: text('transfer_id'),
		notes: text('notes'),
		createdAt: text('created_at').notNull(),
	},
	(t) => [
		index('idx_transactions_account_date').on(t.accountId, t.date),
		index('idx_transactions_transfer').on(t.transferId),
	],
)

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert
export type Pool = typeof pools.$inferSelect
export type NewPool = typeof pools.$inferInsert
export type Allocation = typeof allocations.$inferSelect
export type NewAllocation = typeof allocations.$inferInsert
export type FinanceEvent = typeof events.$inferSelect
export type NewFinanceEvent = typeof events.$inferInsert
export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
