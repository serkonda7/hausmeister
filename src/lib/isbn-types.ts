// What the ISBN lookup returns to the UI (quick add, shelf mode).
import type { IsbnLookup } from './item-types/fields'
import type { JsonObject } from './items/types'

export type BookInfo = {
	isbn: string
	title: string
	subtitle: string | null
	authors: string[]
	publisher: string | null
	year: number | null
	language: string | null
	series: string | null
	pages: number | null
	source: IsbnLookup
}

export type BookLookupResult =
	/** `attributes`: the type's fields filled from the book (stored shape). */
	| { status: 'found'; book: BookInfo; name: string; attributes: JsonObject }
	| { status: 'not_found'; isbn: string }
	/** No source answered (offline, rate-limited): try again later or type it in. */
	| { status: 'unavailable'; isbn: string }

export const SOURCE_LABEL: Record<IsbnLookup, string> = {
	dnb: 'Deutsche Nationalbibliothek',
	openlibrary: 'Open Library',
	google: 'Google Books',
}
