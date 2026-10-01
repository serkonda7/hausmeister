import { eq } from 'drizzle-orm'
import { canEditBook, type PublicUser } from 'shared/src/book'
import type { Db } from '../db'
import { books } from '../schema'
import { fail } from './http'

export type BookRow = typeof books.$inferSelect

export function findBook(db: Db, id: string): BookRow | undefined {
	return db.select().from(books).where(eq(books.id, id)).get()
}

export function requireBook(db: Db, id: string): BookRow {
	return findBook(db, id) ?? fail(404, 'Not found')
}

export function assertCanEditBook(book: BookRow, user: PublicUser, verb = 'edit'): void {
	if (!canEditBook(book, user)) fail(403, `Forbidden: you can only ${verb} your own books`)
}

/** Load a book for a book-scoped write: 404 if missing, 403 unless owner or admin. */
export function requireEditableBook(db: Db, id: string, user: PublicUser): BookRow {
	const book = requireBook(db, id)
	assertCanEditBook(book, user)
	return book
}

/** Bump a book's modification timestamp after a book-scoped write. */
export function touchBook(db: Db, bookId: string, timestamp = Date.now()): void {
	db.update(books).set({ updatedAt: timestamp }).where(eq(books.id, bookId)).run()
}
