import type { EnrichedBook } from './books-enrichment'

export type BookListFilter = {
	q?: string
	owner?: string
	location?: string
}

/** In-memory text search over the enriched list payload (matches original behavior). */
export function filterBooks(books: EnrichedBook[], filter: BookListFilter): EnrichedBook[] {
	const q = filter.q?.toLowerCase().trim() ?? ''
	const ownerFilter = filter.owner?.trim() ?? ''
	const locationFilter = filter.location?.trim() ?? ''
	return books.filter((b) => {
		if (ownerFilter && b.ownerId !== ownerFilter) {
			return false
		}
		if (locationFilter && b.locationId !== locationFilter) {
			return false
		}
		if (!q) {
			return true
		}
		const statusHaystack = b.ownership.toLowerCase()
		const owner = b.owner as { username?: string; displayName?: string | null } | null
		const ownerHaystack = `${owner?.displayName ?? ''} ${owner?.username ?? ''}`.toLowerCase()
		return (
			b.title.toLowerCase().includes(q) ||
			(b.subtitle ?? '').toLowerCase().includes(q) ||
			b.authors
				.map((a) => a.name)
				.join(' ')
				.toLowerCase()
				.includes(q) ||
			(b.isbn ?? '').toLowerCase().includes(q) ||
			b.tags
				.map((t) => t.name)
				.join(' ')
				.toLowerCase()
				.includes(q) ||
			(b.publisher?.name ?? '').toLowerCase().includes(q) ||
			(
				(b.location as { name?: string; fullPath?: string } | null)?.fullPath ??
				(b.location as { name?: string } | null)?.name ??
				''
			)
				.toLowerCase()
				.includes(q) ||
			ownerHaystack.includes(q) ||
			(b.provenance as Array<{ party?: string | null; kind: string }>)
				.map((e) => `${e.kind} ${e.party ?? ''}`)
				.join(' ')
				.toLowerCase()
				.includes(q) ||
			statusHaystack.includes(q) ||
			(b.languages as Array<{ name: string }>)
				.map((language) => language.name)
				.join(' ')
				.toLowerCase()
				.includes(q)
		)
	})
}
