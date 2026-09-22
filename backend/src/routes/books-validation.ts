import { eq, inArray } from 'drizzle-orm'
import { authors, languages, locations, publishers, tags } from '../schema'
import type { BooksDb } from './books-types'

export function ensureAuthorsExist(db: BooksDb, authorIds: string[]): string | null {
	const ids = [...new Set(authorIds)]
	if (ids.length === 0) {
		return null
	}
	const rows = db.select().from(authors).where(inArray(authors.id, ids)).all()
	if (rows.length !== ids.length) {
		return 'Unknown author id'
	}
	return null
}

export function ensurePublisherExists(db: BooksDb, publisherId: string): string | null {
	const [row] = db.select().from(publishers).where(eq(publishers.id, publisherId)).all()
	if (!row) {
		return 'Unknown publisher id'
	}
	return null
}

export function ensureTagsExist(db: BooksDb, tagIds: string[]): string | null {
	const ids = [...new Set(tagIds)]
	if (ids.length === 0) {
		return null
	}
	const rows = db.select().from(tags).where(inArray(tags.id, ids)).all()
	if (rows.length !== ids.length) {
		return 'Unknown tag id'
	}
	return null
}

export function ensureLanguagesExist(db: BooksDb, languageIds: string[]): string | null {
	const ids = [...new Set(languageIds)]
	if (ids.length === 0) return null
	const rows = db.select().from(languages).where(inArray(languages.id, ids)).all()
	return rows.length === ids.length ? null : 'One or more language ids do not exist'
}

export function ensureLocationExists(db: BooksDb, locationId: string): string | null {
	const [row] = db.select().from(locations).where(eq(locations.id, locationId)).all()
	if (!row) {
		return 'Unknown location id'
	}
	return null
}
