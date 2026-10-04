import { PAGE_NOTE_LIMITS } from 'shared/src/book'
import { type Accessor, createSignal } from 'solid-js'
import { api, errorMessage } from '../api'
import { type TranslationKey, t } from '../i18n'
import type { Book, BookFormState, PageNote, PublicUser } from '../types'
import { priceToCents } from '../utils/books'
import type { CatalogKind } from './useCatalog'

const EMPTY_FORM: BookFormState = {
	isbn: '',
	title: '',
	subtitle: '',
	printYear: '',
	dedications: [],
	damages: [],
	authorIds: [],
	tagIds: [],
	languageIds: [],
	publisherId: '',
	locationId: '',
	ownerId: '',
	provKind: '',
	provDate: '',
	provParty: '',
	provPrice: '',
}

/** Which form field holds the selection for each catalog kind. */
const SELECTION_FIELD = {
	authors: 'authorIds',
	tags: 'tagIds',
	languages: 'languageIds',
	publishers: 'publisherId',
	locations: 'locationId',
} as const satisfies Record<CatalogKind, keyof BookFormState>

export type MultiSelectField = 'authorIds' | 'tagIds' | 'languageIds'

function formFromBook(book: Book): BookFormState {
	return {
		...EMPTY_FORM,
		isbn: book.isbn ?? '',
		title: book.title,
		subtitle: book.subtitle ?? '',
		printYear: book.printYear?.toString() ?? '',
		dedications: book.dedications,
		damages: book.damages,
		authorIds: book.authorIds,
		tagIds: book.tagIds,
		languageIds: book.languageIds,
		publisherId: book.publisherId ?? '',
		locationId: book.locationId ?? '',
		ownerId: book.ownerId ?? '',
	}
}

/** Comparable form of a field value: trimmed text, order-insensitive id lists. */
function fieldKey(value: BookFormState[keyof BookFormState]): string {
	if (typeof value === 'string') return value.trim()
	const isIdList = value.every((v) => typeof v === 'string')
	return JSON.stringify(isIdList ? [...value].sort() : value)
}

function validate(f: BookFormState): TranslationKey | null {
	if (!f.title.trim()) return 'form.titleRequired'
	if (f.printYear.trim() && Number.isNaN(Number.parseInt(f.printYear, 10))) {
		return 'form.printYearNumber'
	}
	if (f.provPrice.trim() && priceToCents(f.provPrice) === undefined) return 'form.priceInvalid'
	return null
}

function cleanNotes(notes: PageNote[]): PageNote[] {
	return notes
		.map((n) => ({
			page: n.page.trim().slice(0, PAGE_NOTE_LIMITS.page),
			text: n.text.trim().slice(0, PAGE_NOTE_LIMITS.text),
		}))
		.filter((n) => n.text !== '')
}

function bookPayload(f: BookFormState) {
	const printYear = Number.parseInt(f.printYear, 10)
	return {
		isbn: f.isbn.trim() || undefined,
		title: f.title.trim(),
		subtitle: f.subtitle.trim() || null,
		authorIds: f.authorIds,
		publisherId: f.publisherId || null,
		locationId: f.locationId || null,
		printYear: Number.isNaN(printYear) ? undefined : printYear,
		tagIds: f.tagIds,
		languageIds: f.languageIds,
		dedications: cleanNotes(f.dedications),
		damages: cleanNotes(f.damages),
	}
}

/** Create the draft lifecycle event, if the user picked a kind. */
async function saveDraftEvent(bookId: string, f: BookFormState): Promise<void> {
	if (!f.provKind) return
	await api(`/books/${encodeURIComponent(bookId)}/provenance`, {
		method: 'POST',
		body: {
			kind: f.provKind,
			occurredAt: f.provDate.trim() || undefined,
			party: f.provParty.trim() || undefined,
			priceCents: priceToCents(f.provPrice),
		},
	})
}

export type BookFormDeps = {
	user: Accessor<PublicUser | null>
	/** Reload books and everything showing book counts. */
	refresh: () => Promise<unknown>
}

/** Book add/edit form state and save/remove handlers. */
export function useBookForm(deps: BookFormDeps) {
	const [form, setForm] = createSignal<BookFormState>(EMPTY_FORM)
	const [saving, setSaving] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)
	const [actionError, setActionError] = createSignal<string | null>(null)
	const [deletingId, setDeletingId] = createSignal<string | null>(null)
	const [editingBook, setEditingBook] = createSignal<Book | null>(null)

	function setField<K extends keyof BookFormState>(key: K, value: BookFormState[K]): void {
		setForm((f) => ({ ...f, [key]: value }))
	}

	function toggle(field: MultiSelectField, id: string): void {
		const ids = form()[field]
		setField(field, ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
	}

	function select(kind: CatalogKind, id: string): void {
		const field = SELECTION_FIELD[kind]
		if (field === 'publisherId' || field === 'locationId') setField(field, id)
		else if (!form()[field].includes(id)) toggle(field, id)
	}

	function deselect(kind: CatalogKind, id: string): void {
		const field = SELECTION_FIELD[kind]
		if (field === 'publisherId' || field === 'locationId') {
			if (form()[field] === id) setField(field, '')
		} else if (form()[field].includes(id)) {
			toggle(field, id)
		}
	}

	function resetForm(): void {
		setForm(EMPTY_FORM)
		setError(null)
	}

	function editBook(book: Book): void {
		setForm(formFromBook(book))
		setError(null)
		setEditingBook(book)
	}

	function closeEditBook(): void {
		if (saving()) return
		setEditingBook(null)
		resetForm()
	}

	function isEditDirty(): boolean {
		const book = editingBook()
		if (!book) return false
		const initial = formFromBook(book)
		const current = form()
		const fields = Object.keys(initial) as Array<keyof BookFormState>
		return fields.some((key) => fieldKey(current[key]) !== fieldKey(initial[key]))
	}

	/** Validate, then run `save`; reports failures as the form error. */
	async function submit(fallback: TranslationKey, save: (f: BookFormState) => Promise<void>) {
		setError(null)
		const f = form()
		const invalid = validate(f)
		if (invalid) {
			setError(t(invalid))
			return false
		}
		setSaving(true)
		try {
			await save(f)
			return true
		} catch (err) {
			setError(errorMessage(err, fallback))
			return false
		} finally {
			setSaving(false)
		}
	}

	async function saveEditedBook(): Promise<boolean> {
		const book = editingBook()
		if (!book) return false
		const ok = await submit('editBook.saveFailed', async (f) => {
			const body = deps.user()?.isAdmin
				? { ...bookPayload(f), ownerId: f.ownerId || null }
				: bookPayload(f)
			await api(`/books/${encodeURIComponent(book.id)}`, { method: 'PATCH', body })
			await saveDraftEvent(book.id, f)
		})
		if (ok) {
			closeEditBook()
			await deps.refresh()
		}
		return ok
	}

	/**
	 * Create a book from the form. With `keepForAnother`, only the per-copy
	 * fields (title, subtitle, ISBN, dedications, damages) are cleared.
	 */
	async function addBook(keepForAnother = false): Promise<boolean> {
		setActionError(null)
		const ok = await submit('addBook.saveFailed', async (f) => {
			const created = await api<{ book: Book }>('/books', { method: 'POST', body: bookPayload(f) })
			await saveDraftEvent(created.book.id, f)
		})
		if (!ok) return false
		if (keepForAnother) {
			setForm((f) => ({ ...f, title: '', subtitle: '', isbn: '', dedications: [], damages: [] }))
		} else {
			resetForm()
		}
		await deps.refresh()
		return true
	}

	/** Resolves to whether the book was deleted. */
	async function removeBook(id: string): Promise<boolean> {
		if (!window.confirm(t('library.confirmDelete'))) return false
		setActionError(null)
		setDeletingId(id)
		try {
			await api(`/books/${encodeURIComponent(id)}`, { method: 'DELETE' })
			await deps.refresh()
			return true
		} catch (err) {
			setActionError(errorMessage(err, 'library.deleteFailed'))
			return false
		} finally {
			setDeletingId(null)
		}
	}

	async function removeProvenanceEvent(bookId: string, eventId: string): Promise<void> {
		if (!window.confirm(t('editBook.confirmDeleteEvent'))) return
		setError(null)
		try {
			await api(`/provenance/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
			const updated = await api<{ book: Book }>(`/books/${encodeURIComponent(bookId)}`)
			setEditingBook(updated.book)
			await deps.refresh()
		} catch (err) {
			setError(errorMessage(err, 'editBook.deleteEventFailed'))
		}
	}

	return {
		form,
		setField,
		toggle,
		select,
		deselect,
		saving,
		error,
		actionError,
		deletingId,
		editingBook,
		resetForm,
		editBook,
		closeEditBook,
		isEditDirty,
		saveEditedBook,
		addBook,
		removeBook,
		removeProvenanceEvent,
	}
}

export type BookForm = ReturnType<typeof useBookForm>
