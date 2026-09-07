// All amounts in cents, dates as ISO strings (YYYY-MM-DD or ISO)
export type LiquidityTier = 'instant' | 'days' | 'weeks' | 'months' | 'locked'
export type AccountType =
	| 'checking'
	| 'savings'
	| 'broker'
	| 'cash'
	| 'crypto'
	| 'festgeld'
	| 'other'

export interface Account {
	id: string
	name: string
	type: AccountType
	institution: string | null
	openingDate: string | null
	openingBalanceCents: number | null
	iban: string | null
	notes: string | null
	createdAt: string
}

export interface Pool {
	id: string
	name: string
	purpose: string | null
	targetMinCents: number | null
	targetMaxCents: number | null
	targetPercent: number | null
	expectedReturnBps: number | null
	riskLevel: number | null
	volatilityBps: number | null
	horizonMonths: number | null
	color: string | null
	createdAt: string
}

export interface Allocation {
	id: string
	poolId: string
	accountId: string
	amountCents: number
	liquidityOverride: LiquidityTier | null
	unlockAt: string | null
	createdAt: string
}

export interface FinanceEvent {
	id: string
	title: string
	amountCents: number
	direction: 'inflow' | 'outflow'
	date: string
	isRecurring: boolean
	frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | null
	recurringUntil: string | null
	poolId: string | null
	accountId: string | null
	notes: string | null
	createdAt: string
}

export interface Summary {
	totalCents: number
	liquidityMap: Record<LiquidityTier, number>
	poolTotals: Array<{
		pool: Pool
		currentCents: number
		targetMin: number | null
		targetMax: number | null
		targetPercent: number | null
		targetCents: number | null
		allocationCount: number
	}>
	upcomingEvents: Array<FinanceEvent & { projectedDate?: string }>
	unlocks: Array<{
		type: 'account' | 'allocation'
		id: string
		name: string
		unlockAt: string
		amountCents: number
	}>
	counts: { accounts: number; pools: number; allocations: number; events: number }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
	const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
	if (!res.ok) {
		const text = await res.text()
		throw new Error(`${res.status} ${text}`)
	}
	if (res.status === 204) {
		return undefined as T
	}
	return res.json() as Promise<T>
}

export const api = {
	summary: () => req<Summary>('/api/summary'),
	accounts: {
		list: () => req<Account[]>('/api/accounts'),
		create: (d: Omit<Account, 'id' | 'createdAt'>) =>
			req<Account>('/api/accounts', { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Partial<Omit<Account, 'id' | 'createdAt'>>) =>
			req<Account>(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`/api/accounts/${id}`, { method: 'DELETE' }),
	},
	pools: {
		list: () => req<Pool[]>('/api/pools'),
		create: (d: Omit<Pool, 'id' | 'createdAt'>) =>
			req<Pool>('/api/pools', { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Partial<Omit<Pool, 'id' | 'createdAt'>>) =>
			req<Pool>(`/api/pools/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`/api/pools/${id}`, { method: 'DELETE' }),
	},
	allocations: {
		list: () => req<Allocation[]>('/api/allocations'),
		create: (d: Omit<Allocation, 'id' | 'createdAt'>) =>
			req<Allocation>('/api/allocations', { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Partial<Omit<Allocation, 'id' | 'createdAt'>>) =>
			req<Allocation>(`/api/allocations/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`/api/allocations/${id}`, { method: 'DELETE' }),
	},
	events: {
		list: () => req<FinanceEvent[]>('/api/events'),
		create: (d: Omit<FinanceEvent, 'id' | 'createdAt'>) =>
			req<FinanceEvent>('/api/events', { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Partial<Omit<FinanceEvent, 'id' | 'createdAt'>>) =>
			req<FinanceEvent>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`/api/events/${id}`, { method: 'DELETE' }),
	},
}
