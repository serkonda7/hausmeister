import type { getDb } from '../db'

// Shared DB handle type for the books feature.
export type BooksDb = ReturnType<typeof getDb>

export function now(): number {
	return Date.now()
}
