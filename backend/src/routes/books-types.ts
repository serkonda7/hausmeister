import { eq } from 'drizzle-orm'
import type { getDb } from '../db'
import { books } from '../schema'

// Shared DB handle type for the books feature.
export type BooksDb = ReturnType<typeof getDb>

export function now(): number {
	return Date.now()
}

/** Bump a book's modification timestamp after a book-scoped write. */
export function touchBookUpdatedAt(db: BooksDb, bookId: string, timestamp: number = now()): void {
	db.update(books).set({ updatedAt: timestamp }).where(eq(books.id, bookId)).run()
}
