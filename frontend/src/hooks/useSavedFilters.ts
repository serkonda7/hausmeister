import type { FilterTableSavedFilter } from '@serkonda7/solid-components'
import type { SavedFilterScope } from 'shared/src/book'
import { createSignal } from 'solid-js'
import { api, errorMessage } from '../api'

type SavedFiltersResponse = { savedFilters: FilterTableSavedFilter[] }

/** The logged-in user's saved filters of one table, persisted on the server. */
export function useSavedFilters(scope: SavedFilterScope) {
	const url = `/saved-filters/${scope}`
	const [savedFilters, setSavedFilters] = createSignal<FilterTableSavedFilter[]>([])
	const [saveError, setSaveError] = createSignal<string | null>(null)
	// Only the newest request may update the list, so out-of-order responses can't revert it.
	let latest = 0

	async function load(): Promise<void> {
		const request = ++latest
		try {
			const data = await api<SavedFiltersResponse>(url)
			if (request === latest) setSavedFilters(data.savedFilters)
		} catch (err) {
			if (request === latest) setSaveError(errorMessage(err, 'library.savedFiltersLoadFailed'))
		}
	}

	async function save(next: FilterTableSavedFilter[]): Promise<void> {
		const request = ++latest
		setSaveError(null)
		// Optimistic: show the new list immediately, reconcile with the server's copy.
		setSavedFilters(next)
		try {
			const data = await api<SavedFiltersResponse>(url, {
				method: 'PUT',
				body: { savedFilters: next },
			})
			if (request === latest) setSavedFilters(data.savedFilters)
		} catch (err) {
			if (request !== latest) return
			setSaveError(errorMessage(err, 'library.savedFiltersSaveFailed'))
			void load()
		}
	}

	void load()

	return { savedFilters, saveError, save }
}
