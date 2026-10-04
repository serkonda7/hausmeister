export type Page = 'library' | 'add-book' | 'book' | 'reading' | 'catalog' | 'locations' | 'users'

/** Pages reachable under a fixed path; the rest carry an id in their path. */
export type StaticPage = Exclude<Page, 'book'>

export const PAGE_PATHS: Record<StaticPage, string> = {
	library: '/library',
	'add-book': '/library/add',
	reading: '/reading',
	catalog: '/catalog',
	locations: '/locations',
	users: '/users',
}

const BOOK_PATH_PREFIX = '/library/books/'

export function bookPath(id: string): string {
	return BOOK_PATH_PREFIX + encodeURIComponent(id)
}

/** Id of the book shown at `pathname`, or null when it is not a book page. */
export function bookIdFromPath(pathname: string): string | null {
	if (!pathname.startsWith(BOOK_PATH_PREFIX)) return null
	const id = pathname.slice(BOOK_PATH_PREFIX.length)
	return id && !id.includes('/') ? decodeURIComponent(id) : null
}

export function pageFromPath(pathname: string): Page {
	if (bookIdFromPath(pathname)) return 'book'
	const match = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname)
	return match ? (match[0] as Page) : 'library'
}
