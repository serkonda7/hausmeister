import { type Accessor, createResource, createSignal } from 'solid-js'
import { api, errorMessage } from '../api'
import { type TranslationKey, t } from '../i18n'
import type { Location, NamedEntry, PublicUser } from '../types'

/**
 * A server-side list such as `/authors` (response `{ authors: [...] }`), loaded
 * while `source` is truthy and reloaded when it changes (e.g. on login).
 */
export function createList<T>(
	source: Accessor<string | null | undefined>,
	path: string | Accessor<string>,
) {
	const url = typeof path === 'string' ? () => path : path
	const [items, { refetch, mutate }] = createResource(source, async () => {
		const data = await api<Record<string, T[]>>(url())
		return data[url().slice(1).split('?')[0]]
	})
	return {
		items: (): T[] => items() ?? [],
		loading: () => items.loading,
		error: (): unknown => items.error,
		refetch,
		mutate,
	}
}

export type List<T> = ReturnType<typeof createList<T>>

export type NamedKind = 'authors' | 'publishers' | 'tags' | 'languages'
export type CatalogKind = NamedKind | 'locations'

export type CatalogLists = { [K in NamedKind]: List<NamedEntry> } & { locations: List<Location> }

export function createCatalogLists(userId: Accessor<string | null | undefined>): CatalogLists {
	return {
		authors: createList(userId, '/authors'),
		publishers: createList(userId, '/publishers'),
		tags: createList(userId, '/tags'),
		languages: createList(userId, '/languages'),
		locations: createList(userId, '/locations'),
	}
}

export function createUserList(user: Accessor<PublicUser | null>): List<PublicUser> {
	return createList(() => (user()?.isAdmin ? user()?.id : null), '/users')
}

const SINGULAR = {
	authors: 'author',
	publishers: 'publisher',
	tags: 'tag',
	languages: 'language',
	locations: 'location',
} as const

type Messages = Record<
	'createFailed' | 'rename' | 'renameFailed' | 'confirmDelete' | 'deleteFailed',
	TranslationKey
>

function messages(kind: CatalogKind): Messages {
	if (kind === 'locations') {
		return {
			createFailed: 'locations.createFailed',
			rename: 'locations.rename',
			renameFailed: 'locations.renameFailed',
			confirmDelete: 'locations.confirmDelete',
			deleteFailed: 'locations.deleteFailed',
		}
	}
	const one = SINGULAR[kind]
	return {
		createFailed: `catalog.${one}CreateFailed`,
		rename: `catalog.${one}Rename`,
		renameFailed: `catalog.${one}RenameFailed`,
		confirmDelete: `catalog.${one}ConfirmDelete`,
		deleteFailed: `catalog.${one}DeleteFailed`,
	}
}

export type CatalogActionDeps = {
	lists: CatalogLists
	refetchBooks: () => unknown
	/** Called after an entry was deleted, so selections can drop it. */
	onRemoved: (kind: CatalogKind, id: string) => void
}

/** Create / rename / move / delete catalog entries, with one shared error message. */
export function useCatalogActions(deps: CatalogActionDeps) {
	const [error, setError] = createSignal<string | null>(null)

	/** Run `action`, showing its failure as the catalog error. Returns whether it succeeded. */
	async function run(failKey: TranslationKey, action: () => Promise<unknown>): Promise<boolean> {
		setError(null)
		try {
			await action()
			return true
		} catch (err) {
			setError(errorMessage(err, failKey))
			return false
		}
	}

	async function create(
		kind: CatalogKind,
		name: string,
		parentId?: string,
	): Promise<NamedEntry | null> {
		const trimmed = name.trim()
		if (!trimmed) return null
		let created: NamedEntry | null = null
		await run(messages(kind).createFailed, async () => {
			const body = { name: trimmed, parentId: parentId || undefined }
			const data = await api<Record<string, NamedEntry>>(`/${kind}`, { method: 'POST', body })
			created = data[SINGULAR[kind]]
			await deps.lists[kind].refetch()
		})
		return created
	}

	function update(kind: CatalogKind, id: string, body: unknown, failKey: TranslationKey) {
		return run(failKey, async () => {
			await api(`/${kind}/${encodeURIComponent(id)}`, { method: 'PATCH', body })
			await Promise.all([deps.lists[kind].refetch(), deps.refetchBooks()])
		})
	}

	async function rename(kind: CatalogKind, id: string, current: string): Promise<void> {
		const name = window.prompt(t(messages(kind).rename), current)?.trim()
		if (!name || name === current) return
		await update(kind, id, { name }, messages(kind).renameFailed)
	}

	async function moveLocation(id: string, parentId: string): Promise<void> {
		await update('locations', id, { parentId: parentId || null }, 'locations.moveFailed')
	}

	async function remove(kind: CatalogKind, id: string, name: string): Promise<void> {
		if (!window.confirm(t(messages(kind).confirmDelete, { name }))) return
		await run(messages(kind).deleteFailed, async () => {
			await api(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' })
			deps.onRemoved(kind, id)
			await Promise.all([deps.lists[kind].refetch(), deps.refetchBooks()])
		})
	}

	return { error, create, rename, moveLocation, remove }
}

export type CatalogActions = ReturnType<typeof useCatalogActions>
