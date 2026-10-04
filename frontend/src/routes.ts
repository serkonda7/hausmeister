export type Page =
	| 'library'
	| 'add-book'
	| 'book'
	| 'author'
	| 'publisher'
	| 'reading'
	| 'catalog'
	| 'locations'
	| 'users'

/** Pages reachable under a fixed path; the rest carry an id in their path. */
export type StaticPage = Exclude<Page, EntityPage>

/** Pages showing one entity, identified by the id at the end of their path. */
export type EntityPage = 'book' | 'author' | 'publisher'

export const PAGE_PATHS: Record<StaticPage, string> = {
	library: '/library',
	'add-book': '/library/add',
	reading: '/reading',
	catalog: '/catalog',
	locations: '/locations',
	users: '/users',
}

const ENTITY_PATH_PREFIXES: Record<EntityPage, string> = {
	book: '/library/books/',
	author: '/catalog/authors/',
	publisher: '/catalog/publishers/',
}

function entityPath(page: EntityPage, id: string): string {
	return ENTITY_PATH_PREFIXES[page] + encodeURIComponent(id)
}

export const bookPath = (id: string) => entityPath('book', id)
export const authorPath = (id: string) => entityPath('author', id)
export const publisherPath = (id: string) => entityPath('publisher', id)

/** Id of the `page` entity shown at `pathname`, or null when it is another page. */
export function entityIdFromPath(page: EntityPage, pathname: string): string | null {
	const prefix = ENTITY_PATH_PREFIXES[page]
	if (!pathname.startsWith(prefix)) return null
	const id = pathname.slice(prefix.length)
	return id && !id.includes('/') ? decodeURIComponent(id) : null
}

export function pageFromPath(pathname: string): Page {
	const entity = (Object.keys(ENTITY_PATH_PREFIXES) as EntityPage[]).find((page) =>
		entityIdFromPath(page, pathname),
	)
	if (entity) return entity
	const match = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname)
	return match ? (match[0] as Page) : 'library'
}
