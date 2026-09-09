import type { Account, Category, Pool } from './api'

function fallback(id: string): string {
	return id.slice(0, 8)
}

/** Find a pool name, falling back to an id prefix when unknown. */
export function poolName(pools: Pool[] | undefined, id: string): string {
	return pools?.find((p) => p.id === id)?.name ?? fallback(id)
}

/** Find an account name, falling back to an id prefix when unknown. */
export function accountName(accounts: Account[] | undefined, id: string): string {
	return accounts?.find((a) => a.id === id)?.name ?? fallback(id)
}

/** Find a category by id (`null`/unknown → `undefined`). */
export function categoryOf(
	categories: Category[] | undefined,
	id: string | null,
): Category | undefined {
	if (!id) {
		return undefined
	}
	return categories?.find((c) => c.id === id)
}
