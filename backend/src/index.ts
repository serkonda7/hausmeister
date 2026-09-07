import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index'
import { accounts, allocations, events, pools } from './db/schema'
import {
	accountCreateSchema,
	accountUpdateSchema,
	allocationCreateSchema,
	allocationUpdateSchema,
	eventCreateSchema,
	eventUpdateSchema,
	poolCreateSchema,
	poolUpdateSchema,
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

// --- Helpers ---

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
	await db.delete(accounts).where(eq(accounts.id, c.req.param('id')))
	return c.json({ ok: true })
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

// ============ SUMMARY / DASHBOARD ============
app.get('/summary', async (c) => {
	const allAccounts = await db.select().from(accounts)
	const allPools = await db.select().from(pools)
	const allAllocations = await db.select().from(allocations)
	const allEvents = await db.select().from(events)

	const totalCents = allAccounts.reduce((s, a) => s + (a.openingBalanceCents ?? 0), 0)

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
	// unallocated remainder (opening balance not yet distributed to pools)
	for (const acc of allAccounts) {
		const allocated = allocatedByAccount.get(acc.id) ?? 0
		const remainder = (acc.openingBalanceCents ?? 0) - allocated
		if (remainder > 0) {
			liquidityMap['instant'] = (liquidityMap['instant'] ?? 0) + remainder
		}
	}

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
		upcomingEvents: upcoming.slice(0, 50),
		unlocks,
		counts: {
			accounts: allAccounts.length,
			pools: allPools.length,
			allocations: allAllocations.length,
			events: allEvents.length,
		},
	})
})

export default {
	port: Number(process.env.PORT ?? 3000),
	fetch: app.fetch,
}
