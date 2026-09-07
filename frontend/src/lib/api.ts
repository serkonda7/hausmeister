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

// Phase 1: ledger
export type CategoryKind = 'income' | 'expense'

export interface Category {
	id: string
	name: string
	kind: CategoryKind | null
	color: string | null
	createdAt: string
}

export interface Transaction {
	id: string
	accountId: string
	date: string
	payee: string | null
	categoryId: string | null
	amountCents: number
	direction: 'inflow' | 'outflow'
	transferId: string | null
	notes: string | null
	createdAt: string
}

export interface AccountBalance {
	accountId: string
	name: string
	openingCents: number
	currentCents: number
	allocatedCents: number
	unallocatedCents: number
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
	accountBalances: AccountBalance[]
	counts: {
		accounts: number
		pools: number
		allocations: number
		events: number
		transactions: number
		categories: number
	}
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
	categories: {
		list: () => req<Category[]>('/api/categories'),
		create: (d: Omit<Category, 'id' | 'createdAt'>) =>
			req<Category>('/api/categories', { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Partial<Omit<Category, 'id' | 'createdAt'>>) =>
			req<Category>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`/api/categories/${id}`, { method: 'DELETE' }),
	},
	transactions: {
		list: (accountId?: string) =>
			req<Transaction[]>(accountId ? `/api/transactions?accountId=${accountId}` : '/api/transactions'),
		create: (d: Omit<Transaction, 'id' | 'createdAt' | 'transferId'>) =>
			req<Transaction>('/api/transactions', { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Partial<Omit<Transaction, 'id' | 'createdAt' | 'transferId'>>) =>
			req<Transaction>(`/api/transactions/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`/api/transactions/${id}`, { method: 'DELETE' }),
	},
	transfers: {
		create: (d: {
			fromAccountId: string
			toAccountId: string
			amountCents: number
			date: string
			payee?: string | null
			categoryId?: string | null
			notes?: string | null
		}) => req<{ transferId: string; legs: Transaction[] }>('/api/transfers', { method: 'POST', body: JSON.stringify(d) }),
	},
	balances: {
		account: (id: string) =>
			req<AccountBalance & { transactionCount: number }>(`/api/accounts/${id}/balance`),
	},
}
