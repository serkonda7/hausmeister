import type { Ownership, PageNote, ProvenanceKind, PublicUser } from 'shared/src/book'

export type { Ownership, PageNote, ProvenanceKind, PublicUser }

/** Catalog entry that only carries a name (author, publisher, tag, language). */
export type NamedEntry = {
	id: string
	name: string
	bookCount?: number
}

export type Location = NamedEntry & {
	parentId: string | null
	childrenCount?: number
	path?: Array<{ id: string; name: string }>
	fullPath?: string
	depth?: number
}

export type ProvenanceEvent = {
	id: string
	bookId: string
	kind: ProvenanceKind
	occurredAt: number | null
	party: string | null
	priceCents: number | null
	createdAt: number
}

export type Book = {
	id: string
	isbn: string | null
	title: string
	subtitle: string | null
	authorIds: string[]
	authors: NamedEntry[]
	tagIds: string[]
	tags: NamedEntry[]
	languageIds: string[]
	languages: NamedEntry[]
	publisherId: string | null
	publisher: NamedEntry | null
	locationId: string | null
	location: { id: string; name: string; parentId: string | null; fullPath: string } | null
	ownerId: string | null
	owner: Pick<PublicUser, 'id' | 'username' | 'displayName'> | null
	printYear: number | null
	provenance: ProvenanceEvent[]
	ownership: Ownership
	dedications: PageNote[]
	damages: PageNote[]
	coverUrl: string | null
	description: string | null
	createdAt: number
	updatedAt: number
	/** When the logged-in user marked this book as read; null = unread. */
	readAt: number | null
}

export type BookFormState = {
	isbn: string
	title: string
	subtitle: string
	printYear: string
	dedications: PageNote[]
	damages: PageNote[]
	authorIds: string[]
	tagIds: string[]
	languageIds: string[]
	publisherId: string
	locationId: string
	ownerId: string
	/** Optional lifecycle event created together with the save. */
	provKind: string
	provDate: string
	provParty: string
	provPrice: string
}
