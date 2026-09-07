import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index'
import {
	accounts,
	allocations,
	categories,
	events,
	pools,
	transactions,
} from './db/schema'
import {
	accountCreateSchema,
	accountUpdateSchema,
	allocationCreateSchema,
	allocationUpdateSchema,
	categoryCreateSchema,
	categoryUpdateSchema,
	eventCreateSchema,
	eventUpdateSchema,
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

async function exists(table: object, rowId: string): Promise<boolean> {
	const idCol = (table as { id: Parameters<typeof eq>[0] }).id
	const row = await db
		.select({ id: idCol as never })
		.from(table as never)
		.where(eq(idCol, rowId))
		.limit(1)
	return row.length > 0
}

function signedCents(amountCents: number, direction: 'inflow' | 'outflow'): number {
	return direction === 'inflow' ? amountCents : -amountCents
}

type AccountRow = typeof accounts.$inferSelect
type TransactionRow = typeof transactions.$inferSelect
type AllocationRow = typeof allocations.$inferSelect

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

async function overAllocation(
	accountId: string,
	proposedTotalAllocated: number,
): Promise<{ currentCents: number; allocatedCents: number } | null> {
	const acc = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
	if (acc.length === 0) {
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
	const current = currentBalanceFor(acc[0], txns)
	if (proposedTotalAllocated > current) {
		return { currentCents: current, allocatedCents: proposedTotalAllocated }
	}
	return null
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
	const row = await db
		.select()
		.from(accounts)
		.where(eq(accounts.id, c.req.param('id')))
		.limit(1)
	if (row.length === 0) {
		return c.json({ error: 'Account not found' }, 404)
	}
	return c.json(row[0])
})

app.put('/accounts/:id', vValidator('json', accountUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await db
		.select()
		.from(accounts)
		.where(eq(accounts.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Account not found' }, 404)
	}
	const updated = {
		name: data.name ?? existing[0].name,
		type: data.type ?? existing[0].type,
		institution:
			data.institution !== undefined ? (data.institution ?? null) : existing[0].institution,
		openingDate:
			data.openingDate !== undefined ? (data.openingDate ?? null) : existing[0].openingDate,
		openingBalanceCents:
			data.openingBalanceCents !== undefined
				? (data.openingBalanceCents ?? null)
				: existing[0].openingBalanceCents,
		iban: data.iban !== undefined ? (data.iban ?? null) : existing[0].iban,
		notes: data.notes !== undefined ? (data.notes ?? null) : existing[0].notes,
	}
	await db
		.update(accounts)
		.set(updated)
		.where(eq(accounts.id, c.req.param('id')))
	return c.json({ ...existing[0], ...updated })
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
	const found = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1)
	if (found.length === 0) {
		return c.json({ error: 'Account not found' }, 404)
	}
	const txns = await db
		.select({
			accountId: transactions.accountId,
			amountCents: transactions.amountCents,
			direction: transactions.direction,
		})
		.from(transactions)
		.where(eq(transactions.accountId, accountId))
	const currentCents = currentBalanceFor(found[0], txns)
	const allAllocs = await db
		.select({ accountId: allocations.accountId, amountCents: allocations.amountCents })
		.from(allocations)
		.where(eq(allocations.accountId, accountId))
	const allocatedCents = allocatedFor(accountId, allAllocs)
	return c.json({
		accountId,
		openingCents: found[0].openingBalanceCents ?? 0,
		currentCents,
		allocatedCents,
		unallocatedCents: currentCents - allocatedCents,
		transactionCount: txns.length,
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
	const row = await db
		.select()
		.from(pools)
		.where(eq(pools.id, c.req.param('id')))
		.limit(1)
	if (row.length === 0) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	return c.json(row[0])
})

app.put('/pools/:id', vValidator('json', poolUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await db
		.select()
		.from(pools)
		.where(eq(pools.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Pool not found' }, 404)
	}
	const updated = {
		name: data.name ?? existing[0].name,
		purpose: data.purpose !== undefined ? (data.purpose ?? null) : existing[0].purpose,
		targetMinCents:
			data.targetMinCents !== undefined
				? (data.targetMinCents ?? null)
				: existing[0].targetMinCents,
		targetMaxCents:
			data.targetMaxCents !== undefined
				? (data.targetMaxCents ?? null)
				: existing[0].targetMaxCents,
		targetPercent:
			data.targetPercent !== undefined
				? (data.targetPercent ?? null)
				: existing[0].targetPercent,
		expectedReturnBps:
			data.expectedReturnBps !== undefined
				? (data.expectedReturnBps ?? null)
				: existing[0].expectedReturnBps,
		riskLevel: data.riskLevel !== undefined ? (data.riskLevel ?? null) : existing[0].riskLevel,
		volatilityBps:
			data.volatilityBps !== undefined
				? (data.volatilityBps ?? null)
				: existing[0].volatilityBps,
		horizonMonths:
			data.horizonMonths !== undefined
				? (data.horizonMonths ?? null)
				: existing[0].horizonMonths,
		color: data.color !== undefined ? (data.color ?? null) : existing[0].color,
	}
	await db
		.update(pools)
		.set(updated)
		.where(eq(pools.id, c.req.param('id')))
	return c.json({ ...existing[0], ...updated })
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
	if (!(await exists(accounts, data.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	const existing = await db
		.select({ accountId: allocations.accountId, amountCents: allocations.amountCents })
		.from(allocations)
		.where(eq(allocations.accountId, data.accountId))
	const over = await overAllocation(
		data.accountId,
		allocatedFor(data.accountId, existing) + data.amountCents,
	)
	if (over) {
		return c.json({ error: 'Allocation exceeds account balance', ...over }, 422)
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
	const existing = await db
		.select()
		.from(allocations)
		.where(eq(allocations.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Allocation not found' }, 404)
	}
	const updated = {
		poolId: data.poolId ?? existing[0].poolId,
		accountId: data.accountId ?? existing[0].accountId,
		amountCents: data.amountCents ?? existing[0].amountCents,
		liquidityOverride:
			data.liquidityOverride !== undefined
				? (data.liquidityOverride ?? null)
				: existing[0].liquidityOverride,
		unlockAt: data.unlockAt !== undefined ? (data.unlockAt ?? null) : existing[0].unlockAt,
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
		updated.accountId !== existing[0].accountId
	) {
		// Recompute allocation total for the (possibly new) account, excluding this row
		const siblings = await db
			.select({ accountId: allocations.accountId, amountCents: allocations.amountCents })
			.from(allocations)
			.where(eq(allocations.accountId, updated.accountId))
		const siblingTotal = siblings
			.filter((a) => a.accountId === updated.accountId)
			.reduce((s, a) => s + a.amountCents, 0)
		// siblings include this row's old amount only when account unchanged
		const oldAmountInSiblings =
			updated.accountId === existing[0].accountId ? existing[0].amountCents : 0
		const over = await overAllocation(
			updated.accountId,
			siblingTotal - oldAmountInSiblings + updated.amountCents,
		)
		if (over) {
			return c.json({ error: 'Allocation exceeds account balance', ...over }, 422)
		}
		// Moving to another account frees the old account — no check needed there.
	}
	await db
		.update(allocations)
		.set(updated)
		.where(eq(allocations.id, c.req.param('id')))
	return c.json({ ...existing[0], ...updated })
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
	const existing = await db
		.select()
		.from(events)
		.where(eq(events.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Event not found' }, 404)
	}
	const updated = {
		title: data.title ?? existing[0].title,
		amountCents: data.amountCents ?? existing[0].amountCents,
		direction: data.direction ?? existing[0].direction,
		date: data.date ?? existing[0].date,
		isRecurring: data.isRecurring ?? existing[0].isRecurring,
		frequency: data.frequency !== undefined ? (data.frequency ?? null) : existing[0].frequency,
		recurringUntil:
			data.recurringUntil !== undefined
				? (data.recurringUntil ?? null)
				: existing[0].recurringUntil,
		poolId: data.poolId !== undefined ? (data.poolId ?? null) : existing[0].poolId,
		accountId: data.accountId !== undefined ? (data.accountId ?? null) : existing[0].accountId,
		notes: data.notes !== undefined ? (data.notes ?? null) : existing[0].notes,
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
	return c.json({ ...existing[0], ...updated })
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
	const existing = await db
		.select()
		.from(categories)
		.where(eq(categories.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Category not found' }, 404)
	}
	const updated = {
		name: data.name?.trim() ?? existing[0].name,
		kind: data.kind !== undefined ? (data.kind ?? null) : existing[0].kind,
		color: data.color !== undefined ? (data.color ?? null) : existing[0].color,
	}
	try {
		await db.update(categories).set(updated).where(eq(categories.id, c.req.param('id')))
	} catch {
		return c.json({ error: 'Category name already exists' }, 409)
	}
	return c.json({ ...existing[0], ...updated })
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
		const acc = await db
			.select()
			.from(accounts)
			.where(eq(accounts.id, data.accountId))
			.limit(1)
		const txns = await db
			.select({
				accountId: transactions.accountId,
				amountCents: transactions.amountCents,
				direction: transactions.direction,
			})
			.from(transactions)
			.where(eq(transactions.accountId, data.accountId))
		const allocs = await db
			.select({ accountId: allocations.accountId, amountCents: allocations.amountCents })
			.from(allocations)
			.where(eq(allocations.accountId, data.accountId))
		const current = currentBalanceFor(acc[0], txns) - data.amountCents
		const allocated = allocatedFor(data.accountId, allocs)
		if (allocated > current) {
			return c.json(
				{ error: 'Transaction would over-allocate account', currentCents: current, allocatedCents: allocated },
				422,
			)
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
	const existing = await db
		.select()
		.from(transactions)
		.where(eq(transactions.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Transaction not found' }, 404)
	}
	if (existing[0].transferId != null) {
		return c.json({ error: 'Transfer legs must be edited via DELETE + POST /transfers' }, 409)
	}
	const updated = {
		accountId: data.accountId ?? existing[0].accountId,
		date: data.date ?? existing[0].date,
		payee: data.payee !== undefined ? (data.payee ?? null) : existing[0].payee,
		categoryId: data.categoryId !== undefined ? (data.categoryId ?? null) : existing[0].categoryId,
		amountCents: data.amountCents ?? existing[0].amountCents,
		direction: data.direction ?? existing[0].direction,
		notes: data.notes !== undefined ? (data.notes ?? null) : existing[0].notes,
	}
	if (!(await exists(accounts, updated.accountId))) {
		return c.json({ error: 'Account not found' }, 404)
	}
	if (updated.categoryId != null && !(await exists(categories, updated.categoryId))) {
		return c.json({ error: 'Category not found' }, 404)
	}
	await db.update(transactions).set(updated).where(eq(transactions.id, c.req.param('id')))
	return c.json({ ...existing[0], ...updated })
})

app.delete('/transactions/:id', async (c) => {
	const existing = await db
		.select()
		.from(transactions)
		.where(eq(transactions.id, c.req.param('id')))
		.limit(1)
	if (existing.length === 0) {
		return c.json({ error: 'Transaction not found' }, 404)
	}
	if (existing[0].transferId != null) {
		// Delete both legs atomically
		await db.delete(transactions).where(eq(transactions.transferId, existing[0].transferId))
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
	const src = await db
		.select()
		.from(accounts)
		.where(eq(accounts.id, data.fromAccountId))
		.limit(1)
	const srcTxns = await db
		.select({
			accountId: transactions.accountId,
			amountCents: transactions.amountCents,
			direction: transactions.direction,
		})
		.from(transactions)
		.where(eq(transactions.accountId, data.fromAccountId))
	const srcAllocs = await db
		.select({ accountId: allocations.accountId, amountCents: allocations.amountCents })
		.from(allocations)
		.where(eq(allocations.accountId, data.fromAccountId))
	const srcCurrent = currentBalanceFor(src[0], srcTxns) - data.amountCents
	const srcAllocated = allocatedFor(data.fromAccountId, srcAllocs)
	if (srcAllocated > srcCurrent) {
		return c.json(
			{ error: 'Transfer would over-allocate source account', currentCents: srcCurrent, allocatedCents: srcAllocated },
			422,
		)
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
			liquidityMap['instant'] = (liquidityMap['instant'] ?? 0) + remainder
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
				if (ev.frequency === 'weekly') {
					d.setDate(d.getDate() + 7)
				} else if (ev.frequency === 'biweekly') {
					d.setDate(d.getDate() + 14)
				} else if (ev.frequency === 'monthly') {
					d.setMonth(d.getMonth() + 1)
				} else if (ev.frequency === 'quarterly') {
					d.setMonth(d.getMonth() + 3)
				} else if (ev.frequency === 'yearly') {
					d.setFullYear(d.getFullYear() + 1)
				} else {
					break
				}
			}
			// collect all occurrences in window
			while (d >= today && d <= in90 && d <= until) {
				upcoming.push({ ...ev, projectedDate: d.toISOString().slice(0, 10) })
				if (ev.frequency === 'weekly') {
					d.setDate(d.getDate() + 7)
				} else if (ev.frequency === 'biweekly') {
					d.setDate(d.getDate() + 14)
				} else if (ev.frequency === 'monthly') {
					d.setMonth(d.getMonth() + 1)
				} else if (ev.frequency === 'quarterly') {
					d.setMonth(d.getMonth() + 3)
				} else if (ev.frequency === 'yearly') {
					d.setFullYear(d.getFullYear() + 1)
				} else {
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
