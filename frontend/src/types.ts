import type { AuthUser } from './api'

export type AppUser = AuthUser

export type ManagedUser = AuthUser

export type Author = {
	id: string
	name: string
	bookCount?: number
}

export type Publisher = {
	id: string
	name: string
	bookCount?: number
}

export type Tag = {
	id: string
	name: string
	bookCount?: number
}
export type Language = Tag

export type Location = {
	id: string
	name: string
	parentId: string | null
	bookCount?: number
	childrenCount?: number
	path?: Array<{ id: string; name: string }>
	fullPath?: string
	depth?: number
}

export type ProvenanceKind = 'buy' | 'sell' | 'other'

export type Ownership = 'owned' | 'disposed' | 'unknown'

export type ProvenanceEvent = {
	id: string
	bookId: string
	kind: ProvenanceKind
	occurredAt: number | null
	party: string | null
	priceCents: number | null
	createdAt: number
}

export type BookOwner = {
	id: string
	username: string
	displayName: string | null
}

export type BookLocation = {
	id: string
	name: string
	parentId: string | null
	fullPath: string
}

export type PageNote = {
	page: string
	text: string
}

export type Book = {
	id: string
	isbn: string | null
	title: string
	subtitle: string | null
	authorIds: string[]
	authors: Author[]
	tagIds: string[]
	tags: Tag[]
	languageIds: string[]
	languages: Language[]
	publisherId: string | null
	publisher: Publisher | null
	locationId: string | null
	location: BookLocation | null
	ownerId: string | null
	owner: BookOwner | null
	printYear: number | null
	provenance: ProvenanceEvent[]
	ownership: Ownership
	dedications: PageNote[]
	damages: PageNote[]
	coverUrl: string | null
	description: string | null
}

export type Page = 'library' | 'add-book' | 'catalog' | 'locations' | 'users'

export type BookFormState = {
	isbn: string
	title: string
	subtitle: string
	printYear: string
	dedications: PageNote[]
	damages: PageNote[]
	languages: string
	provKind: string
	provDate: string
	provParty: string
	provPrice: string
}
