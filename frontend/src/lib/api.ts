// All amounts in cents, dates as ISO strings (YYYY-MM-DD or ISO)
import type { AccountType, CategoryKind, Direction, Frequency, LiquidityTier } from './enums'

// Re-export for backward compat (components may import these from './api')
export type { AccountType, CategoryKind, Direction, Frequency, LiquidityTier } from './enums'

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
	direction: Direction
	date: string
	isRecurring: boolean
	frequency: Frequency | null
	recurringUntil: string | null
	poolId: string | null
	accountId: string | null
	notes: string | null
	createdAt: string
}

// Phase 1: ledger
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
	direction: Direction
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

interface CrudResource<T, Create, Update> {
	list: () => Promise<T[]>
	create: (d: Create) => Promise<T>
	update: (id: string, d: Update) => Promise<T>
	remove: (id: string) => Promise<{ ok: true }>
}

/** Single place for the list/create/update/remove wrapper (one problem, one solution). */
function crud<T, Create, Update>(path: string): CrudResource<T, Create, Update> {
	return {
		list: () => req<T[]>(path),
		create: (d: Create) => req<T>(path, { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Update) =>
			req<T>(`${path}/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`${path}/${id}`, { method: 'DELETE' }),
	}
}

type AccountCreate = Omit<Account, 'id' | 'createdAt'>
type AccountUpdate = Partial<AccountCreate>
type PoolCreate = Omit<Pool, 'id' | 'createdAt'>
type PoolUpdate = Partial<PoolCreate>
type AllocationCreate = Omit<Allocation, 'id' | 'createdAt'>
type AllocationUpdate = Partial<AllocationCreate>
type EventCreate = Omit<FinanceEvent, 'id' | 'createdAt'>
type EventUpdate = Partial<EventCreate>
type CategoryCreate = Omit<Category, 'id' | 'createdAt'>
type CategoryUpdate = Partial<CategoryCreate>
type TransactionCreate = Omit<Transaction, 'id' | 'createdAt' | 'transferId'>
type TransactionUpdate = Partial<TransactionCreate>

export const api = {
	summary: () => req<Summary>('/api/summary'),
	accounts: crud<Account, AccountCreate, AccountUpdate>('/api/accounts'),
	pools: crud<Pool, PoolCreate, PoolUpdate>('/api/pools'),
	allocations: crud<Allocation, AllocationCreate, AllocationUpdate>('/api/allocations'),
	events: crud<FinanceEvent, EventCreate, EventUpdate>('/api/events'),
	categories: crud<Category, CategoryCreate, CategoryUpdate>('/api/categories'),
	transactions: {
		...crud<Transaction, TransactionCreate, TransactionUpdate>('/api/transactions'),
		list: (accountId?: string) =>
			req<Transaction[]>(
				accountId ? `/api/transactions?accountId=${accountId}` : '/api/transactions',
			),
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
		}) =>
			req<{ transferId: string; legs: Transaction[] }>('/api/transfers', {
				method: 'POST',
				body: JSON.stringify(d),
			}),
	},
	balances: {
		account: (id: string) =>
			req<AccountBalance & { transactionCount: number }>(`/api/accounts/${id}/balance`),
	},
}
