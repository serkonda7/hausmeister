import { type Accessor, createSignal, type Setter } from 'solid-js'
import { api } from '../api'
import { t } from '../i18n'
import type { Author, Language, Location, Publisher, Tag } from '../types'

export type CatalogSelections = {
	setSelectedAuthorIds: Setter<string[]>
	getSelectedPublisherId: Accessor<string>
	setSelectedPublisherId: Setter<string>
	getSelectedLocationId: Accessor<string>
	setSelectedLocationId: Setter<string>
	setSelectedTagIds: Setter<string[]>
	setSelectedLanguageIds: Setter<string[]>
}

export type CatalogRefetchers = {
	refetchBooks: () => unknown
	refetchAuthors: () => unknown
	refetchPublishers: () => unknown
	refetchLocations: () => unknown
	refetchTags: () => unknown
	refetchLanguages: () => unknown
}

export type CatalogDeps = CatalogSelections & CatalogRefetchers

/** Authors / publishers / locations / tags: create, rename, move, delete. */
export function useCatalogActions(deps: CatalogDeps) {
	const [catalogError, setCatalogError] = createSignal<string | null>(null)
	const [newAuthorName, setNewAuthorName] = createSignal('')
	const [newPublisherName, setNewPublisherName] = createSignal('')
	const [newLocationName, setNewLocationName] = createSignal('')
	const [newTagName, setNewTagName] = createSignal('')
	const [newLanguageName, setNewLanguageName] = createSignal('')
	const [manageAuthorName, setManageAuthorName] = createSignal('')
	const [managePublisherName, setManagePublisherName] = createSignal('')
	const [manageLocationName, setManageLocationName] = createSignal('')
	const [manageLocationParentId, setManageLocationParentId] = createSignal('')
	const [manageTagName, setManageTagName] = createSignal('')
	const [manageLanguageName, setManageLanguageName] = createSignal('')

	/** Clear the add-form inline-create inputs (used after a successful save). */
	function resetInlineInputs(): void {
		setNewAuthorName('')
		setNewPublisherName('')
		setNewLocationName('')
		setNewTagName('')
		setNewLanguageName('')
	}

	async function createAuthor(name: string): Promise<Author | null> {
		const trimmed = name.trim()
		if (!trimmed) {
			return null
		}
		try {
			const data = await api<{ author: Author }>('/authors', {
				method: 'POST',
				body: JSON.stringify({ name: trimmed }),
			})
			await deps.refetchAuthors()
			return data.author
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.authorCreateFailed'))
			return null
		}
	}

	async function createPublisher(name: string): Promise<Publisher | null> {
		const trimmed = name.trim()
		if (!trimmed) {
			return null
		}
		try {
			const data = await api<{ publisher: Publisher }>('/publishers', {
				method: 'POST',
				body: JSON.stringify({ name: trimmed }),
			})
			await deps.refetchPublishers()
			return data.publisher
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.publisherCreateFailed'))
			return null
		}
	}

	async function createLocation(name: string, parentId?: string): Promise<Location | null> {
		const trimmed = name.trim()
		if (!trimmed) {
			return null
		}
		try {
			const data = await api<{ location: Location }>('/locations', {
				method: 'POST',
				body: JSON.stringify({ name: trimmed, parentId: parentId || undefined }),
			})
			await deps.refetchLocations()
			return data.location
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('locations.createFailed'))
			return null
		}
	}

	async function createTag(name: string): Promise<Tag | null> {
		const trimmed = name.trim()
		if (!trimmed) {
			return null
		}
		try {
			const data = await api<{ tag: Tag }>('/tags', {
				method: 'POST',
				body: JSON.stringify({ name: trimmed }),
			})
			await deps.refetchTags()
			return data.tag
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.tagCreateFailed'))
			return null
		}
	}
	async function createLanguage(name: string): Promise<Language | null> {
		const trimmed = name.trim()
		if (!trimmed) return null
		try {
			const data = await api<{ language: Language }>('/languages', {
				method: 'POST',
				body: JSON.stringify({ name: trimmed }),
			})
			await deps.refetchLanguages()
			return data.language
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.languageCreateFailed'))
			return null
		}
	}

	async function addInlineAuthor(): Promise<void> {
		const author = await createAuthor(newAuthorName())
		if (author) {
			deps.setSelectedAuthorIds((ids) => (ids.includes(author.id) ? ids : [...ids, author.id]))
			setNewAuthorName('')
		}
	}

	async function addInlinePublisher(): Promise<void> {
		const publisher = await createPublisher(newPublisherName())
		if (publisher) {
			deps.setSelectedPublisherId(publisher.id)
			setNewPublisherName('')
		}
	}

	async function addInlineLocation(parentId?: string): Promise<void> {
		const location = await createLocation(
			newLocationName(),
			parentId || deps.getSelectedLocationId() || undefined,
		)
		if (location) {
			deps.setSelectedLocationId(location.id)
			setNewLocationName('')
		}
	}

	async function addInlineTag(): Promise<void> {
		const tag = await createTag(newTagName())
		if (tag) {
			deps.setSelectedTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]))
			setNewTagName('')
		}
	}
	async function addInlineLanguage(): Promise<void> {
		const language = await createLanguage(newLanguageName())
		if (language) {
			deps.setSelectedLanguageIds((ids) =>
				ids.includes(language.id) ? ids : [...ids, language.id],
			)
			setNewLanguageName('')
		}
	}

	async function addManageAuthor(): Promise<void> {
		const author = await createAuthor(manageAuthorName())
		if (author) {
			setManageAuthorName('')
		}
	}

	async function addManagePublisher(): Promise<void> {
		const publisher = await createPublisher(managePublisherName())
		if (publisher) {
			setManagePublisherName('')
		}
	}

	async function addManageLocation(): Promise<void> {
		const location = await createLocation(
			manageLocationName(),
			manageLocationParentId() || undefined,
		)
		if (location) {
			setManageLocationName('')
		}
	}

	async function addManageTag(): Promise<void> {
		const tag = await createTag(manageTagName())
		if (tag) {
			setManageTagName('')
		}
	}
	async function addManageLanguage(): Promise<void> {
		if (await createLanguage(manageLanguageName())) setManageLanguageName('')
	}

	async function renameAuthor(id: string, current: string): Promise<void> {
		const name = window.prompt(t('catalog.authorRename'), current)
		if (name === null || name.trim() === '' || name.trim() === current) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/authors/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim() }),
			})
			await Promise.all([deps.refetchAuthors(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.authorRenameFailed'))
		}
	}

	async function removeAuthor(id: string, name: string): Promise<void> {
		if (!window.confirm(t('catalog.authorConfirmDelete', { name }))) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/authors/${encodeURIComponent(id)}`, { method: 'DELETE' })
			deps.setSelectedAuthorIds((ids) => ids.filter((a) => a !== id))
			await Promise.all([deps.refetchAuthors(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.authorDeleteFailed'))
		}
	}

	async function renameTag(id: string, current: string): Promise<void> {
		const name = window.prompt(t('catalog.tagRename'), current)
		if (name === null || name.trim() === '' || name.trim() === current) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/tags/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim() }),
			})
			await Promise.all([deps.refetchTags(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.tagRenameFailed'))
		}
	}

	async function removeTag(id: string, name: string): Promise<void> {
		if (!window.confirm(t('catalog.tagConfirmDelete', { name }))) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/tags/${encodeURIComponent(id)}`, { method: 'DELETE' })
			deps.setSelectedTagIds((ids) => ids.filter((t) => t !== id))
			await Promise.all([deps.refetchTags(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.tagDeleteFailed'))
		}
	}
	async function renameLanguage(id: string, current: string): Promise<void> {
		const name = window.prompt(t('catalog.languageRename'), current)
		if (name === null || !name.trim() || name.trim() === current) return
		try {
			await api(`/languages/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim() }),
			})
			await Promise.all([deps.refetchLanguages(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.languageRenameFailed'))
		}
	}
	async function removeLanguage(id: string, name: string): Promise<void> {
		if (!window.confirm(t('catalog.languageConfirmDelete', { name }))) return
		try {
			await api(`/languages/${encodeURIComponent(id)}`, { method: 'DELETE' })
			deps.setSelectedLanguageIds((ids) => ids.filter((l) => l !== id))
			await Promise.all([deps.refetchLanguages(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.languageDeleteFailed'))
		}
	}

	async function renamePublisher(id: string, current: string): Promise<void> {
		const name = window.prompt(t('catalog.publisherRename'), current)
		if (name === null || name.trim() === '' || name.trim() === current) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/publishers/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim() }),
			})
			await Promise.all([deps.refetchPublishers(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.publisherRenameFailed'))
		}
	}

	async function removePublisher(id: string, name: string): Promise<void> {
		if (!window.confirm(t('catalog.publisherConfirmDelete', { name }))) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/publishers/${encodeURIComponent(id)}`, { method: 'DELETE' })
			if (deps.getSelectedPublisherId() === id) {
				deps.setSelectedPublisherId('')
			}
			await Promise.all([deps.refetchPublishers(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('catalog.publisherDeleteFailed'))
		}
	}

	async function renameLocation(id: string, current: string): Promise<void> {
		const name = window.prompt(t('locations.rename'), current)
		if (name === null || name.trim() === '' || name.trim() === current) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/locations/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim() }),
			})
			await Promise.all([deps.refetchLocations(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('locations.renameFailed'))
		}
	}

	async function moveLocation(id: string, parentId: string): Promise<void> {
		setCatalogError(null)
		try {
			await api(`/locations/${encodeURIComponent(id)}`, {
				method: 'PATCH',
				body: JSON.stringify({ parentId: parentId || null }),
			})
			await Promise.all([deps.refetchLocations(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('locations.moveFailed'))
		}
	}

	async function removeLocation(id: string, name: string): Promise<void> {
		if (!window.confirm(t('locations.confirmDelete', { name }))) {
			return
		}
		setCatalogError(null)
		try {
			await api(`/locations/${encodeURIComponent(id)}`, { method: 'DELETE' })
			if (deps.getSelectedLocationId() === id) {
				deps.setSelectedLocationId('')
			}
			if (manageLocationParentId() === id) {
				setManageLocationParentId('')
			}
			await Promise.all([deps.refetchLocations(), deps.refetchBooks()])
		} catch (err) {
			setCatalogError(err instanceof Error ? err.message : t('locations.deleteFailed'))
		}
	}

	return {
		catalogError,
		newAuthorName,
		setNewAuthorName,
		newPublisherName,
		setNewPublisherName,
		newLocationName,
		setNewLocationName,
		newTagName,
		newLanguageName,
		setNewTagName,
		manageAuthorName,
		setManageAuthorName,
		managePublisherName,
		setManagePublisherName,
		manageLocationName,
		setManageLocationName,
		manageLocationParentId,
		setManageLocationParentId,
		manageTagName,
		manageLanguageName,
		setNewLanguageName,
		setManageLanguageName,
		setManageTagName,
		resetInlineInputs,
		addInlineAuthor,
		addInlinePublisher,
		addInlineLocation,
		addInlineTag,
		addInlineLanguage,
		addManageAuthor,
		addManagePublisher,
		addManageLocation,
		addManageTag,
		addManageLanguage,
		renameAuthor,
		removeAuthor,
		renameTag,
		removeTag,
		renameLanguage,
		removeLanguage,
		renamePublisher,
		removePublisher,
		renameLocation,
		moveLocation,
		removeLocation,
	}
}

export type CatalogStore = ReturnType<typeof useCatalogActions>
