import { vValidator } from '@hono/valibot-validator'
import { desc, eq, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index'
import {
	accounts,
	allocations,
	type CurrencyCode,
	categories,
	currencies,
	events,
	exchangeRates,
	pools,
	transactions,
} from './db/schema'
import { downloadEurUsdRates, downloadEurUsdRatesRange, normalizeCode } from './exchange'
import {
	accountCreateSchema,
	accountUpdateSchema,
	allocationCreateSchema,
	allocationUpdateSchema,
	categoryCreateSchema,
	categoryUpdateSchema,
	currencyUpdateSchema,
	eventCreateSchema,
	eventUpdateSchema,
	exchangeRateCreateSchema,
	poolCreateSchema,
	poolUpdateSchema,
	transactionCreateSchema,
	transactionUpdateSchema,
	transferCreateSchema,
} from './validators'

const app = new Hono()

app.use(cors())

function id() {
	return crypto.randomUUID()
}
function now() {
	return new Date().toISOString()
}

// Health
app.get('/health', (c) => c.json({ status: 'ok', time: now() }))

type AccountRow = typeof accounts.$inferSelect
type PoolRow = typeof pools.$inferSelect
type TransactionRow = typeof transactions.$inferSelect
type AllocationRow = typeof allocations.$inferSelect
type EventRow = typeof events.$inferSelect
type CategoryRow = typeof categories.$inferSelect

// 3a: nullable PATCH merge — `undefined` keeps existing, `null` clears.
function mergePatch<T>(existing: T | null, incoming: T | null | undefined): T | null {
	return incoming !== undefined ? (incoming ?? null) : existing
}

// 3c: find-by-id returning row-or-null (route returns 404 with existing message).
async function findByIdOrNull<TRow>(table: object, rowId: string): Promise<TRow | null> {
	const idCol = (table as { id: Parameters<typeof eq>[0] }).id
	const rows = await db
		.select()
		.from(table as never)
		.where(eq(idCol, rowId))
		.limit(1)
	return (rows[0] as TRow | undefined) ?? null
}

async function exists(table: object, rowId: string): Promise<boolean> {
	return (await findByIdOrNull(table, rowId)) !== null
}

function signedCents(amountCents: number, direction: 'inflow' | 'outflow'): number {
	return direction === 'inflow' ? amountCents : -amountCents
}

function currentBalanceFor(
	account: AccountRow,
	txns: Pick<TransactionRow, 'accountId' | 'amountCents' | 'direction'>[],
): number {
	let balance = account.openingBalanceCents ?? 0
	for (const t of txns) {
		if (t.accountId === account.id) {
			balance += signedCents(t.amountCents, t.direction)
		}
	}
	return balance
}

function allocatedFor(
	accountId: string,
	allocs: Pick<AllocationRow, 'accountId' | 'amountCents'>[],
): number {
	return allocs.reduce((s, a) => (a.accountId === accountId ? s + a.amountCents : s), 0)
}

// 3b: shared account state — single place for load-account+txns+allocs →
// currentBalanceFor → allocatedFor. All over-allocation guards use this.
async function getAccountState(accountId: string): Promise<{
	account: AccountRow
	current: number
	allocated: number
	transactionCount: number
} | null> {
	const account = await findByIdOrNull<AccountRow>(accounts, accountId)
	if (!account) {
		return null
	}
	const txns = await db
		.select({
			accountId: transactions.accountId,
			amountCents: transactions.amountCents,
			direction: transactions.direction,
		})
		.from(transactions)
		.where(eq(transactions.accountId, accountId))
	const allocs = await db
		.select({ accountId: allocations.accountId, amountCents: allocations.amountCents })
		.from(allocations)
		.where(eq(allocations.accountId, accountId))
	return {
		account,
		current: currentBalanceFor(account, txns),
		allocated: allocatedFor(accountId, allocs),
		transactionCount: txns.length,
	}
}

type CoverBreach = { currentCents: number; allocatedCents: number }

// Pure cores: single place for the `allocated <= current` invariant.
function allocationBreach(
	currentCents: number,
	proposedAllocatedCents: number,
): CoverBreach | null {
	if (proposedAllocatedCents > currentCents) {
		return { currentCents, allocatedCents: proposedAllocatedCents }
	}
	return null
}

function outflowBreach(
	currentCents: number,
	allocatedCents: number,
	outflowCents: number,
): CoverBreach | null {
	const after = currentCents - outflowCents
	if (allocatedCents > after) {
		return { currentCents: after, allocatedCents }
	}
	return null
}

// Async wrapper for call sites without a loaded state. Returns null when the
// account is missing (callers 404 on `getAccountState()` first) or covered.
// 3b: outflow guard — balance after a new outflow must still cover allocations.
async function assertCovers(accountId: string, outflowCents: number): Promise<CoverBreach | null> {
	const state = await getAccountState(accountId)
	if (!state) {
		return null
	}
	return outflowBreach(state.current, state.allocated, outflowCents)
}

// 3d: frequency stepping — returns false for unknown freq.
function advanceDate(d: Date, freq: string): boolean {
	if (freq === 'weekly') {
		d.setDate(d.getDate() + 7)
		return true
	}
	if (freq === 'biweekly') {
		d.setDate(d.getDate() + 14)
		return true
	}
	if (freq === 'monthly') {
		d.setMonth(d.getMonth() + 1)
		return true
	}
	if (freq === 'quarterly') {
		d.setMonth(d.getMonth() + 3)
		return true
	}
	if (freq === 'yearly') {
		d.setFullYear(d.getFullYear() + 1)
		return true
	}
	return false
}

// ============ ACCOUNTS ============
app.get('/accounts', async (c) => {
	const rows = await db.select().from(accounts).orderBy(accounts.createdAt)
	return c.json(rows)
})

app.post('/accounts', vValidator('json', accountCreateSchema), async (c) => {
	const data = c.req.valid('json')
	const row = {
		id: id(),
		name: data.name,
		type: data.type,
		institution: data.institution ?? null,
		openingDate: data.openingDate ?? null,
		openingBalanceCents: data.openingBalanceCents ?? null,
		iban: data.iban ?? null,
		notes: data.notes ?? null,
		createdAt: now(),
	}
	await db.insert(accounts).values(row)
	return c.json(row, 201)
})

app.get('/accounts/:id', async (c) => {
	const row = await findByIdOrNull<AccountRow>(accounts, c.req.param('id'))
	if (!row) {
		return c.json({ error: 'Account not found' }, 404)
	}
	return c.json(row)
})

app.put('/accounts/:id', vValidator('json', accountUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<AccountRow>(accounts, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Account not found' }, 404)
	}
	const updated = {
		name: data.name ?? existing.name,
		type: data.type ?? existing.type,
		institution: mergePatch(existing.institution, data.institution),
		openingDate: mergePatch(existing.openingDate, data.openingDate),
		openingBalanceCents: mergePatch(existing.openingBalanceCents, data.openingBalanceCents),
		iban: mergePatch(existing.iban, data.iban),
		notes: mergePatch(existing.notes, data.notes),
	}
	await db
		.update(accounts)
		.set(updated)
		.where(eq(accounts.id, c.req.param('id')))
	return c.json({ ...existing, ...updated })
})

app.delete('/accounts/:id', async (c) => {
	const accountId = c.req.param('id')
	const linked = await db
		.select({ id: transactions.id })
		.from(transactions)
		.where(eq(transactions.accountId, accountId))
		.limit(1)
	if (linked.length > 0) {
		return c.json(
			{ error: 'Account has transactions and cannot be deleted. Move or delete them first.' },
			409,
		)
	}
	await db.delete(accounts).where(eq(accounts.id, accountId))
	return c.json({ ok: true })
})

// Current (live) balance: opening + signed transactions
app.get('/accounts/:id/balance', async (c) => {
	const accountId = c.req.param('id')
	const state = await getAccountState(accountId)
	if (!state) {
		return c.json({ error: 'Account not found' }, 404)
	}
	return c.json({
		accountId,
		openingCents: state.account.openingBalanceCents ?? 0,
		currentCents: state.current,
		allocatedCents: state.allocated,
		unallocatedCents: state.current - state.allocated,
		transactionCount: state.transactionCount,
	})
})

// ============ POOLS ============
app.get('/pools', async (c) => {
	const rows = await db.select().from(pools).orderBy(pools.createdAt)
	return c.json(rows)
})

app.post('/pools', vValidator('json', poolCreateSchema), async (c) => {
	const data = c.req.valid('json')
	const row = {
		id: id(),
		name: data.name,
		purpose: data.purpose ?? null,
		targetMinCents: data.targetMinCents ?? null,
		targetMaxCents: data.targetMaxCents ?? null,
		targetPercent: data.targetPercent ?? null,
		expectedReturnBps: data.expectedReturnBps ?? null,
		riskLevel: data.riskLevel ?? null,
		volatilityBps: data.volatilityBps ?? null,
		horizonMonths: data.horizonMonths ?? null,
		color: data.color ?? null,
		createdAt: now(),
	}
	await db.insert(pools).values(row)
	return c.json(row, 201)
})

app.get('/pools/:id', async (c) => {
	const row = await findByIdOrNull<PoolRow>(pools, c.req.param('id'))
	if (!row) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	return c.json(row)
})

app.put('/pools/:id', vValidator('json', poolUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<PoolRow>(pools, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	const updated = {
		name: data.name ?? existing.name,
		purpose: mergePatch(existing.purpose, data.purpose),
		targetMinCents: mergePatch(existing.targetMinCents, data.targetMinCents),
		targetMaxCents: mergePatch(existing.targetMaxCents, data.targetMaxCents),
		targetPercent: mergePatch(existing.targetPercent, data.targetPercent),
		expectedReturnBps: mergePatch(existing.expectedReturnBps, data.expectedReturnBps),
		riskLevel: mergePatch(existing.riskLevel, data.riskLevel),
		volatilityBps: mergePatch(existing.volatilityBps, data.volatilityBps),
		horizonMonths: mergePatch(existing.horizonMonths, data.horizonMonths),
		color: mergePatch(existing.color, data.color),
	}
	await db
		.update(pools)
		.set(updated)
		.where(eq(pools.id, c.req.param('id')))
	return c.json({ ...existing, ...updated })
})

app.delete('/pools/:id', async (c) => {
	await db.delete(pools).where(eq(pools.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ ALLOCATIONS ============
app.get('/allocations', async (c) => {
	const rows = await db.select().from(allocations).orderBy(allocations.createdAt)
	return c.json(rows)
})

app.post('/allocations', vValidator('json', allocationCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (!(await exists(pools, data.poolId))) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	const state = await getAccountState(data.accountId)
	if (!state) {
		return c.json({ error: 'Account not found' }, 404)
	}
	const proposed = state.allocated + data.amountCents
	const breach = allocationBreach(state.current, proposed)
	if (breach) {
		return c.json({ error: 'Allocation exceeds account balance', ...breach }, 422)
	}
	const row = {
		id: id(),
		poolId: data.poolId,
		accountId: data.accountId,
		amountCents: data.amountCents,
		liquidityOverride: data.liquidityOverride ?? null,
		unlockAt: data.unlockAt ?? null,
		createdAt: now(),
	}
	await db.insert(allocations).values(row)
	return c.json(row, 201)
})

app.put('/allocations/:id', vValidator('json', allocationUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<AllocationRow>(allocations, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Allocation not found' }, 404)
	}
	const updated = {
		poolId: data.poolId ?? existing.poolId,
		accountId: data.accountId ?? existing.accountId,
		amountCents: data.amountCents ?? existing.amountCents,
		liquidityOverride: mergePatch(existing.liquidityOverride, data.liquidityOverride),
		unlockAt: mergePatch(existing.unlockAt, data.unlockAt),
	}
	if (data.poolId !== undefined && !(await exists(pools, updated.poolId))) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	if (data.accountId !== undefined && !(await exists(accounts, updated.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	if (
		data.amountCents !== undefined ||
		data.accountId !== undefined ||
		updated.accountId !== existing.accountId
	) {
		// Recompute allocation total for the (possibly new) account, excluding this row.
		// state.allocated already holds the current total for updated.accountId.
		const state = await getAccountState(updated.accountId)
		if (!state) {
			return c.json({ error: 'Account not found' }, 404)
		}
		const oldAmountInState = updated.accountId === existing.accountId ? existing.amountCents : 0
		const proposed = state.allocated - oldAmountInState + updated.amountCents
		const breach = allocationBreach(state.current, proposed)
		if (breach) {
			return c.json(
				{
					error: 'Allocation exceeds account balance',
					...breach,
				},
				422,
			)
		}
		// Moving to another account frees the old account — no check needed there.
	}
	await db
		.update(allocations)
		.set(updated)
		.where(eq(allocations.id, c.req.param('id')))
	return c.json({ ...existing, ...updated })
})

app.delete('/allocations/:id', async (c) => {
	await db.delete(allocations).where(eq(allocations.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ EVENTS ============
app.get('/events', async (c) => {
	const rows = await db.select().from(events).orderBy(events.date)
	return c.json(rows)
})

app.post('/events', vValidator('json', eventCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (data.poolId != null && !(await exists(pools, data.poolId))) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	if (data.accountId != null && !(await exists(accounts, data.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	const row = {
		id: id(),
		title: data.title,
		amountCents: data.amountCents,
		direction: data.direction,
		date: data.date,
		isRecurring: data.isRecurring ?? false,
		frequency: data.frequency ?? null,
		recurringUntil: data.recurringUntil ?? null,
		poolId: data.poolId ?? null,
		accountId: data.accountId ?? null,
		notes: data.notes ?? null,
		createdAt: now(),
	}
	await db.insert(events).values(row)
	return c.json(row, 201)
})

app.put('/events/:id', vValidator('json', eventUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<EventRow>(events, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Event not found' }, 404)
	}
	const updated = {
		title: data.title ?? existing.title,
		amountCents: data.amountCents ?? existing.amountCents,
		direction: data.direction ?? existing.direction,
		date: data.date ?? existing.date,
		isRecurring: data.isRecurring ?? existing.isRecurring,
		frequency: mergePatch(existing.frequency, data.frequency),
		recurringUntil: mergePatch(existing.recurringUntil, data.recurringUntil),
		poolId: mergePatch(existing.poolId, data.poolId),
		accountId: mergePatch(existing.accountId, data.accountId),
		notes: mergePatch(existing.notes, data.notes),
	}
	if (updated.poolId != null && !(await exists(pools, updated.poolId))) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	if (updated.accountId != null && !(await exists(accounts, updated.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	await db
		.update(events)
		.set(updated)
		.where(eq(events.id, c.req.param('id')))
	return c.json({ ...existing, ...updated })
})

app.delete('/events/:id', async (c) => {
	await db.delete(events).where(eq(events.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ CATEGORIES ============
app.get('/categories', async (c) => {
	const rows = await db.select().from(categories).orderBy(categories.name)
	return c.json(rows)
})

app.post('/categories', vValidator('json', categoryCreateSchema), async (c) => {
	const data = c.req.valid('json')
	const row = {
		id: id(),
		name: data.name.trim(),
		kind: data.kind ?? null,
		color: data.color ?? null,
		createdAt: now(),
	}
	try {
		await db.insert(categories).values(row)
	} catch {
		return c.json({ error: 'Category name already exists' }, 409)
	}
	return c.json(row, 201)
})

app.put('/categories/:id', vValidator('json', categoryUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<CategoryRow>(categories, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Category not found' }, 404)
	}
	const updated = {
		name: data.name?.trim() ?? existing.name,
		kind: mergePatch(existing.kind, data.kind),
		color: mergePatch(existing.color, data.color),
	}
	try {
		await db
			.update(categories)
			.set(updated)
			.where(eq(categories.id, c.req.param('id')))
	} catch {
		return c.json({ error: 'Category name already exists' }, 409)
	}
	return c.json({ ...existing, ...updated })
})

app.delete('/categories/:id', async (c) => {
	// transactions keep their history; category FK is SET NULL
	await db.delete(categories).where(eq(categories.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ TRANSACTIONS (actuals ledger) ============
app.get('/transactions', async (c) => {
	const accountId = c.req.query('accountId')
	const rows = accountId
		? await db
				.select()
				.from(transactions)
				.where(eq(transactions.accountId, accountId))
				.orderBy(transactions.date)
		: await db.select().from(transactions).orderBy(transactions.date)
	return c.json(rows)
})

app.post('/transactions', vValidator('json', transactionCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (!(await exists(accounts, data.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	if (data.categoryId != null && !(await exists(categories, data.categoryId))) {
		return c.json({ error: 'Category not found' }, 404)
	}
	// Outflows must not push allocated money into over-allocation:
	// balance after a new outflow must still cover allocations.
	if (data.direction === 'outflow') {
		const over = await assertCovers(data.accountId, data.amountCents)
		if (over) {
			return c.json({ error: 'Transaction would over-allocate account', ...over }, 422)
		}
	}
	const row = {
		id: id(),
		accountId: data.accountId,
		date: data.date,
		payee: data.payee ?? null,
		categoryId: data.categoryId ?? null,
		amountCents: data.amountCents,
		direction: data.direction,
		transferId: null,
		notes: data.notes ?? null,
		createdAt: now(),
	}
	await db.insert(transactions).values(row)
	return c.json(row, 201)
})

app.put('/transactions/:id', vValidator('json', transactionUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<TransactionRow>(transactions, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Transaction not found' }, 404)
	}
	if (existing.transferId != null) {
		return c.json({ error: 'Transfer legs must be edited via DELETE + POST /transfers' }, 409)
	}
	const updated = {
		accountId: data.accountId ?? existing.accountId,
		date: data.date ?? existing.date,
		payee: mergePatch(existing.payee, data.payee),
		categoryId: mergePatch(existing.categoryId, data.categoryId),
		amountCents: data.amountCents ?? existing.amountCents,
		direction: data.direction ?? existing.direction,
		notes: mergePatch(existing.notes, data.notes),
	}
	if (!(await exists(accounts, updated.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	if (updated.categoryId != null && !(await exists(categories, updated.categoryId))) {
		return c.json({ error: 'Category not found' }, 404)
	}
	await db
		.update(transactions)
		.set(updated)
		.where(eq(transactions.id, c.req.param('id')))
	return c.json({ ...existing, ...updated })
})

app.delete('/transactions/:id', async (c) => {
	const existing = await findByIdOrNull<TransactionRow>(transactions, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Transaction not found' }, 404)
	}
	if (existing.transferId != null) {
		// Delete both legs atomically
		await db.delete(transactions).where(eq(transactions.transferId, existing.transferId))
		return c.json({ ok: true, deletedTransfer: true })
	}
	await db.delete(transactions).where(eq(transactions.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ TRANSFERS (atomic account → account) ============
app.post('/transfers', vValidator('json', transferCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (data.fromAccountId === data.toAccountId) {
		return c.json({ error: 'fromAccountId and toAccountId must differ' }, 422)
	}
	if (!(await exists(accounts, data.fromAccountId))) {
		return c.json({ error: 'Source account not found' }, 404)
	}
	if (!(await exists(accounts, data.toAccountId))) {
		return c.json({ error: 'Destination account not found' }, 404)
	}
	if (data.categoryId != null && !(await exists(categories, data.categoryId))) {
		return c.json({ error: 'Category not found' }, 404)
	}
	// Source balance after outflow must still cover its allocations
	const over = await assertCovers(data.fromAccountId, data.amountCents)
	if (over) {
		return c.json({ error: 'Transfer would over-allocate source account', ...over }, 422)
	}
	const transferId = id()
	const stamp = now()
	const outLeg = {
		id: id(),
		accountId: data.fromAccountId,
		date: data.date,
		payee: data.payee ?? null,
		categoryId: data.categoryId ?? null,
		amountCents: data.amountCents,
		direction: 'outflow' as const,
		transferId,
		notes: data.notes ?? null,
		createdAt: stamp,
	}
	const inLeg = {
		id: id(),
		accountId: data.toAccountId,
		date: data.date,
		payee: data.payee ?? null,
		categoryId: data.categoryId ?? null,
		amountCents: data.amountCents,
		direction: 'inflow' as const,
		transferId,
		notes: data.notes ?? null,
		createdAt: stamp,
	}
	await db.insert(transactions).values([outLeg, inLeg])
	return c.json({ transferId, legs: [outLeg, inLeg] }, 201)
})

// ============ CURRENCIES (Firefly III inspired, EUR + USD only) ============
// Both currencies are always enabled; only the default (primary) can be
// switched. Codes are gated through `currencyCodeEnum` so only EUR + USD
// exist for now.
const CURRENCY_SEEDS = [
	{ code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
	{ code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
] as const

type CurrencyRow = typeof currencies.$inferSelect
type ExchangeRateRow = typeof exchangeRates.$inferSelect

async function findCurrency(code: CurrencyCode): Promise<CurrencyRow | null> {
	const rows = await db.select().from(currencies).where(eq(currencies.code, code)).limit(1)
	return rows[0] ?? null
}

// Idempotent seed so fresh DBs (and the demo seed) always list EUR + USD.
async function ensureCurrencies(): Promise<void> {
	const rows = await db.select().from(currencies)
	const byCode = new Set(rows.map((r) => r.code))
	if (CURRENCY_SEEDS.every((s) => byCode.has(s.code))) {
		return
	}
	const hasDefault = rows.some((r) => r.isDefault)
	for (const seed of CURRENCY_SEEDS) {
		if (byCode.has(seed.code)) {
			continue
		}
		await db.insert(currencies).values({
			code: seed.code,
			name: seed.name,
			symbol: seed.symbol,
			decimalPlaces: seed.decimalPlaces,
			enabled: true,
			isDefault: seed.code === 'EUR' && !hasDefault,
			createdAt: now(),
		})
	}
}

app.get('/currencies', async (c) => {
	await ensureCurrencies()
	const rows = await db.select().from(currencies).orderBy(currencies.code)
	return c.json(rows)
})

app.put('/currencies/:code', vValidator('json', currencyUpdateSchema), async (c) => {
	const code = normalizeCode(c.req.param('code'))
	if (!code) {
		return c.json({ error: 'Unsupported currency (only EUR and USD are supported)' }, 400)
	}
	await ensureCurrencies()
	const existing = await findCurrency(code)
	if (!existing) {
		return c.json({ error: 'Currency not found' }, 404)
	}
	const data = c.req.valid('json')

	if (data.isDefault === true) {
		// New primary currency (Firefly: administrations have one primary).
		// The previous default is unset.
		await db.update(currencies).set({ isDefault: false })
		await db
			.update(currencies)
			.set({ isDefault: true, enabled: true })
			.where(eq(currencies.code, code))
		return c.json({ ...existing, isDefault: true, enabled: true })
	}
	if (data.isDefault === false && existing.isDefault) {
		return c.json({ error: 'Set another default currency first' }, 422)
	}
	return c.json(existing)
})

// ============ EXCHANGE RATES ============
// One row per fixing date: EUR→USD from frankfurter.app (ECB-backed JSON
// API). USD→EUR is derived as the inverse on read. Manual entries share the
// same row — downloads are last-write-wins.
async function findRate(date: string): Promise<ExchangeRateRow | null> {
	const rows = await db.select().from(exchangeRates).where(eq(exchangeRates.date, date)).limit(1)
	return rows[0] ?? null
}

async function upsertRate(
	date: string,
	eurUsd: number,
): Promise<'inserted' | 'updated' | 'unchanged'> {
	const existing = await findRate(date)
	if (!existing) {
		await db.insert(exchangeRates).values({ date, rate: eurUsd, createdAt: now() })
		return 'inserted'
	}
	if (existing.rate !== eurUsd) {
		await db.update(exchangeRates).set({ rate: eurUsd }).where(eq(exchangeRates.date, date))
		return 'updated'
	}
	return 'unchanged'
}

/** Stored rate is always EUR→USD; orient it to the requested direction. */
function oriented(eurUsd: number, from: CurrencyCode, to: CurrencyCode): number {
	return from === 'EUR' && to === 'USD' ? eurUsd : 1 / eurUsd
}

app.get('/exchange-rates', async (c) => {
	const from = normalizeCode(c.req.query('from') ?? '')
	const to = normalizeCode(c.req.query('to') ?? '')
	if ((c.req.query('from') && !from) || (c.req.query('to') && !to)) {
		return c.json({ error: 'Unsupported currency (only EUR and USD are supported)' }, 400)
	}
	const f = from ?? 'EUR'
	const t = to ?? 'USD'
	if (f === t) {
		return c.json({ error: 'from and to must differ' }, 422)
	}
	const limit = Math.min(
		Math.max(Number.parseInt(c.req.query('limit') ?? '90', 10) || 90, 1),
		500,
	)
	const order = c.req.query('order') === 'asc' ? 'asc' : 'desc'
	const rows = await db
		.select()
		.from(exchangeRates)
		.orderBy(order === 'asc' ? exchangeRates.date : desc(exchangeRates.date))
		.limit(limit)
	return c.json(rows.map((r) => ({ date: r.date, rate: oriented(r.rate, f, t) })))
})

// Latest known fixing for a pair (Firefly: "list the exchange rate … on the requested date").
app.get('/exchange-rates/latest', async (c) => {
	const f = normalizeCode(c.req.query('from') ?? 'EUR') ?? 'EUR'
	const t = normalizeCode(c.req.query('to') ?? 'USD') ?? 'USD'
	if (f === t) {
		return c.json({ fromCode: f, toCode: t, date: null, rate: 1 })
	}
	const rows = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.date)).limit(1)
	const row = rows[0] ?? null
	if (!row) {
		return c.json({ error: `No exchange rate for ${f}→${t} yet. Download rates first.` }, 404)
	}
	return c.json({ fromCode: f, toCode: t, date: row.date, rate: oriented(row.rate, f, t) })
})

// Convert an amount at the latest fixing on/before `date` (Firefly falls back to rate 1).
app.get('/exchange-rates/convert', async (c) => {
	const f = normalizeCode(c.req.query('from') ?? 'EUR') ?? 'EUR'
	const t = normalizeCode(c.req.query('to') ?? 'USD') ?? 'USD'
	const date = c.req.query('date') ?? null
	const rawAmount = c.req.query('amount')
	const amount = rawAmount == null || rawAmount === '' ? null : Number(rawAmount)
	if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return c.json({ error: 'Expected ISO date YYYY-MM-DD' }, 400)
	}
	if (f === t) {
		return c.json({
			fromCode: f,
			toCode: t,
			date,
			rate: 1,
			rateDate: date,
			amount,
			result: amount,
		})
	}
	const base = db.select().from(exchangeRates)
	const rows = await (date ? base.where(lte(exchangeRates.date, date)) : base)
		.orderBy(desc(exchangeRates.date))
		.limit(1)
	const row = rows[0] ?? null
	const rate = row ? oriented(row.rate, f, t) : 1
	return c.json({
		fromCode: f,
		toCode: t,
		date,
		rate,
		rateDate: row?.date ?? null,
		amount,
		result: amount == null || !Number.isFinite(amount) ? null : amount * rate,
	})
})

app.post('/exchange-rates', vValidator('json', exchangeRateCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (data.fromCode === data.toCode) {
		return c.json({ error: 'fromCode and toCode must differ' }, 422)
	}
	if (!Number.isFinite(data.rate) || data.rate <= 0) {
		return c.json({ error: 'rate must be a number > 0' }, 422)
	}
	// Normalize to the stored EUR→USD basis.
	const eurUsd = data.fromCode === 'EUR' ? data.rate : 1 / data.rate
	await upsertRate(data.date, eurUsd)
	return c.json({ date: data.date, rate: data.rate }, 201)
})

// On-demand download (no cron): frankfurter.app EUR→USD fixings.
// Accepts either an explicit `?from=YYYY-MM-DD&to=YYYY-MM-DD` range or a
// legacy `?days=N` window (defaults to 30). By default only days that have
// transactions are stored — days without transactions are skipped to keep
// the table lean — unless `?storeAll=1` is passed.
app.post('/exchange-rates/download', async (c) => {
	const fromParam = c.req.query('from')
	const toParam = c.req.query('to')
	const storeAllParam = c.req.query('storeAll')
	const storeAll = storeAllParam === '1' || storeAllParam === 'true'
	const ISO_RE = /^\d{4}-\d{2}-\d{2}$/
	type Downloaded = Awaited<ReturnType<typeof downloadEurUsdRatesRange>>
	let downloaded: Downloaded
	try {
		if (fromParam != null || toParam != null) {
			if (!fromParam || !ISO_RE.test(fromParam) || !toParam || !ISO_RE.test(toParam)) {
				return c.json({ error: 'Expected ISO dates YYYY-MM-DD for from and to' }, 400)
			}
			if (fromParam > toParam) {
				return c.json({ error: 'from must not be after to' }, 422)
			}
			const spanDays =
				Math.round(
					(new Date(`${toParam}T00:00:00Z`).getTime() -
						new Date(`${fromParam}T00:00:00Z`).getTime()) /
						86_400_000,
				) + 1
			if (spanDays > 365) {
				return c.json({ error: 'Date range must not exceed 365 days' }, 422)
			}
			downloaded = await downloadEurUsdRatesRange(fromParam, toParam)
		} else {
			const days = Number.parseInt(c.req.query('days') ?? '30', 10) || 30
			downloaded = await downloadEurUsdRates(days)
		}
	} catch {
		return c.json(
			{ error: 'Could not download exchange rates (frankfurter.app unreachable)' },
			502,
		)
	}
	let wanted = downloaded.rates
	if (!storeAll) {
		const txDates = await db.select({ date: transactions.date }).from(transactions)
		const datesWithTransactions = new Set(txDates.map((t) => t.date))
		wanted = downloaded.rates.filter((r) => datesWithTransactions.has(r.date))
	}
	let inserted = 0
	let updated = 0
	for (const r of wanted) {
		const outcome = await upsertRate(r.date, r.eurUsd)
		if (outcome === 'inserted') {
			inserted++
		} else if (outcome === 'updated') {
			updated++
		}
	}
	return c.json({
		source: downloaded.source,
		from: 'EUR',
		to: 'USD',
		start: downloaded.start,
		end: downloaded.end,
		storeAll,
		fetched: wanted.length,
		inserted,
		updated,
		rates: wanted,
	})
})

app.delete('/exchange-rates/:date', async (c) => {
	const date = c.req.param('date')
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return c.json({ error: 'Expected ISO date YYYY-MM-DD' }, 400)
	}
	await db.delete(exchangeRates).where(eq(exchangeRates.date, date))
	return c.json({ ok: true })
})

// ============ SUMMARY / DASHBOARD ============
app.get('/summary', async (c) => {
	const allAccounts = await db.select().from(accounts)
	const allPools = await db.select().from(pools)
	const allAllocations = await db.select().from(allocations)
	const allEvents = await db.select().from(events)
	const allTransactions = await db
		.select({
			accountId: transactions.accountId,
			amountCents: transactions.amountCents,
			direction: transactions.direction,
		})
		.from(transactions)
	const allCategories = await db.select({ id: categories.id }).from(categories)

	// Live balances: opening + signed transactions (Phase 1 ledger)
	const currentByAccount = new Map<string, number>()
	for (const a of allAccounts) {
		currentByAccount.set(a.id, currentBalanceFor(a, allTransactions))
	}
	const totalCents = [...currentByAccount.values()].reduce((s, v) => s + v, 0)

	// Liquidity breakdown: effective tier per allocation override, else instant
	// (accounts no longer carry availability). For unallocated money, use instant.
	const liquidityMap: Record<string, number> = {
		instant: 0,
		days: 0,
		weeks: 0,
		months: 0,
		locked: 0,
	}
	// build map accountId -> total allocated
	const allocatedByAccount = new Map<string, number>()
	for (const al of allAllocations) {
		allocatedByAccount.set(
			al.accountId,
			(allocatedByAccount.get(al.accountId) ?? 0) + al.amountCents,
		)
	}
	// account lookup
	const accountById = new Map(allAccounts.map((a) => [a.id, a]))

	for (const al of allAllocations) {
		const tier = al.liquidityOverride ?? 'instant'
		liquidityMap[tier] = (liquidityMap[tier] ?? 0) + al.amountCents
	}
	// unallocated remainder (current balance not yet distributed to pools)
	for (const acc of allAccounts) {
		const allocated = allocatedByAccount.get(acc.id) ?? 0
		const current = currentByAccount.get(acc.id) ?? 0
		const remainder = current - allocated
		if (remainder > 0) {
			liquidityMap.instant = (liquidityMap.instant ?? 0) + remainder
		}
	}

	const accountBalances = allAccounts.map((a) => {
		const currentCents = currentByAccount.get(a.id) ?? 0
		const allocatedCents = allocatedByAccount.get(a.id) ?? 0
		return {
			accountId: a.id,
			name: a.name,
			openingCents: a.openingBalanceCents ?? 0,
			currentCents,
			allocatedCents,
			unallocatedCents: currentCents - allocatedCents,
		}
	})

	// Pool breakdown
	const poolTotals = allPools.map((p) => {
		const allocs = allAllocations.filter((a) => a.poolId === p.id)
		const currentCents = allocs.reduce((s, a) => s + a.amountCents, 0)
		const targetMin = p.targetMinCents
		const targetMax = p.targetMaxCents
		const targetPercent = p.targetPercent
		const targetCents =
			targetPercent != null ? Math.round((totalCents * targetPercent) / 100) : null
		return {
			pool: p,
			currentCents,
			targetMin,
			targetMax,
			targetPercent,
			targetCents,
			allocationCount: allocs.length,
		}
	})

	// Upcoming events: next 90 days, expand recurring minimally (just list base events in range)
	const today = new Date()
	today.setHours(0, 0, 0, 0)
	const in90 = new Date(today)
	in90.setDate(in90.getDate() + 90)

	function inRange(dateStr: string): boolean {
		const d = new Date(dateStr)
		return d >= today && d <= in90
	}

	// For recurring, we naively project next occurrence within 90d
	const upcoming: Array<(typeof allEvents)[number] & { projectedDate?: string }> = []
	for (const ev of allEvents) {
		if (inRange(ev.date)) {
			upcoming.push(ev)
		} else if (ev.isRecurring && ev.frequency) {
			// find next occurrence after today
			const d = new Date(ev.date)
			const until = ev.recurringUntil ? new Date(ev.recurringUntil) : in90
			// fast forward
			while (d < today && d <= until) {
				if (!advanceDate(d, ev.frequency)) {
					break
				}
			}
			// collect all occurrences in window
			while (d >= today && d <= in90 && d <= until) {
				upcoming.push({ ...ev, projectedDate: d.toISOString().slice(0, 10) })
				if (!advanceDate(d, ev.frequency)) {
					break
				}
				// safety break
				if (upcoming.length > 500) {
					break
				}
			}
		}
	}
	upcoming.sort((a, b) => {
		const da = (a as { projectedDate?: string }).projectedDate ?? a.date
		const db = (b as { projectedDate?: string }).projectedDate ?? b.date
		return da.localeCompare(db)
	})

	// Locked / unlock timeline (allocation-level only; accounts carry no availability)
	const unlocks = [
		...allAllocations
			.filter((a): a is typeof a & { unlockAt: string } => a.unlockAt !== null)
			.map((a) => {
				const acc = accountById.get(a.accountId)
				const pool = allPools.find((p) => p.id === a.poolId)
				return {
					type: 'allocation' as const,
					id: a.id,
					name: `${pool?.name ?? '?'} → ${acc?.name ?? '?'}`,
					unlockAt: a.unlockAt,
					amountCents: a.amountCents,
				}
			}),
	].sort((a, b) => a.unlockAt.localeCompare(b.unlockAt))

	return c.json({
		totalCents,
		liquidityMap,
		poolTotals,
		accountBalances,
		upcomingEvents: upcoming.slice(0, 50),
		unlocks,
		counts: {
			accounts: allAccounts.length,
			pools: allPools.length,
			allocations: allAllocations.length,
			events: allEvents.length,
			transactions: allTransactions.length,
			categories: allCategories.length,
		},
	})
})

export default {
	port: Number(process.env.PORT ?? 3000),
	fetch: app.fetch,
}
