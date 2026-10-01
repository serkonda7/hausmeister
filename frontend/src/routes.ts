export type Page = 'library' | 'add-book' | 'reading' | 'catalog' | 'locations' | 'users'

export const PAGE_PATHS: Record<Page, string> = {
	library: '/library',
	'add-book': '/library/add',
	reading: '/reading',
	catalog: '/catalog',
	locations: '/locations',
	users: '/users',
}

export function pageFromPath(pathname: string): Page {
	const match = Object.entries(PAGE_PATHS).find(([, path]) => path === pathname)
	return match ? (match[0] as Page) : 'library'
}
