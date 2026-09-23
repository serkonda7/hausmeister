import { type Accessor, createSignal } from 'solid-js'
import { api } from '../api'
import type { AppUser, Author, Book, BookFormState, Language, PageNote, Tag } from '../types'
import { asPageNotes, EMPTY_FORM, priceToCents } from '../utils/books'

export type BookFormDeps = {
	authUser: Accessor<AppUser | null>
	refetchBooks: () => unknown
	refetchLocations: () => unknown
	getAuthors: () => Author[] | undefined
	getTags: () => Tag[] | undefined
	getLanguages: () => Language[] | undefined
}

/** Book add/edit form state, selections, and save/remove handlers. */
export function useBookForm(deps: BookFormDeps) {
	const [form, setForm] = createSignal<BookFormState>({
		...EMPTY_FORM,
		dedications: [],
		damages: [],
	})
	const [selectedAuthorIds, setSelectedAuthorIds] = createSignal<string[]>([])
	const [selectedPublisherId, setSelectedPublisherId] = createSignal('')
	const [selectedLocationId, setSelectedLocationId] = createSignal('')
	const [selectedTagIds, setSelectedTagIds] = createSignal<string[]>([])
	const [selectedLanguageIds, setSelectedLanguageIds] = createSignal<string[]>([])
	const [saving, setSaving] = createSignal(false)
	const [formError, setFormError] = createSignal<string | null>(null)
	const [actionError, setActionError] = createSignal<string | null>(null)
	const [deletingId, setDeletingId] = createSignal<string | null>(null)
	const [editingBook, setEditingBook] = createSignal<Book | null>(null)
	const [editSaving, setEditSaving] = createSignal(false)
	const [editError, setEditError] = createSignal<string | null>(null)
	// Owner transfer (admin only, in edit dialog).
	const [selectedOwnerId, setSelectedOwnerId] = createSignal('')

	function setField(key: keyof BookFormState, value: string | PageNote[]): void {
		setForm((f) => ({ ...f, [key]: value }))
	}

	function setPageNotes(key: 'dedications' | 'damages', value: PageNote[]): void {
		setForm((f) => ({ ...f, [key]: value }))
	}

	function toggleAuthor(id: string): void {
		setSelectedAuthorIds((ids) => (ids.includes(id) ? ids.filter((a) => a !== id) : [...ids, id]))
	}

	function toggleTag(id: string): void {
		setSelectedTagIds((ids) => (ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id]))
	}
	function toggleLanguage(id: string): void {
		setSelectedLanguageIds((ids) => (ids.includes(id) ? ids.filter((l) => l !== id) : [...ids, id]))
	}

	function resetForm(): void {
		setForm({ ...EMPTY_FORM, dedications: [], damages: [] })
		setSelectedAuthorIds([])
		setSelectedPublisherId('')
		setSelectedLocationId('')
		setSelectedTagIds([])
		setSelectedLanguageIds([])
		setSelectedOwnerId('')
	}

	/** Clear only per-copy fields so the user can quickly add another book. */
	function resetForNextBook(): void {
		setForm((f) => ({ ...f, title: '', subtitle: '', isbn: '', dedications: [], damages: [] }))
	}

	function editBook(book: Book): void {
		setForm({
			isbn: book.isbn ?? '',
			title: book.title,
			subtitle: book.subtitle ?? '',
			printYear: book.printYear?.toString() ?? '',
			dedications: asPageNotes(book.dedications),
			damages: asPageNotes(book.damages),
			languages: '',
			provKind: '',
			provDate: '',
			provParty: '',
			provPrice: '',
		})
		setSelectedAuthorIds(book.authorIds ?? [])
		setSelectedPublisherId(book.publisherId ?? '')
		setSelectedLocationId(book.locationId ?? '')
		setSelectedTagIds(book.tagIds ?? [])
		setSelectedLanguageIds(book.languageIds ?? [])
		setSelectedOwnerId(book.ownerId ?? '')
		setEditError(null)
		setEditingBook(book)
	}

	function closeEditBook(): void {
		if (editSaving()) return
		setEditingBook(null)
		setEditError(null)
		resetForm()
	}

	function isEditDirty(): boolean {
		const book = editingBook()
		if (!book) return false
		const f = form()
		if ((f.isbn ?? '').trim() !== (book.isbn ?? '').trim()) return true
		if ((f.title ?? '').trim() !== (book.title ?? '').trim()) return true
		if ((f.subtitle ?? '').trim() !== (book.subtitle ?? '').trim()) return true
		if ((f.printYear ?? '').trim() !== (book.printYear?.toString() ?? '')) return true
		if (JSON.stringify(f.dedications ?? []) !== JSON.stringify(asPageNotes(book.dedications)))
			return true
		if (JSON.stringify(f.damages ?? []) !== JSON.stringify(asPageNotes(book.damages))) return true
		if (
			[...(selectedLanguageIds() ?? [])].sort().join(',') !==
			[...(book.languageIds ?? [])].sort().join(',')
		)
			return true
		if (
			[...(selectedAuthorIds() ?? [])].sort().join(',') !==
			[...(book.authorIds ?? [])].sort().join(',')
		)
			return true
		if (
			[...(selectedTagIds() ?? [])].sort().join(',') !== [...(book.tagIds ?? [])].sort().join(',')
		)
			return true
		if ((selectedPublisherId() ?? '') !== (book.publisherId ?? '')) return true
		if ((selectedLocationId() ?? '') !== (book.locationId ?? '')) return true
		if (deps.authUser()?.isAdmin && (selectedOwnerId() ?? '') !== (book.ownerId ?? '')) return true
		// Draft lifecycle event that would be created on save.
		if ([f.provKind, f.provDate, f.provParty, f.provPrice].some((v) => (v ?? '').trim() !== ''))
			return true
		return false
	}

	function requestCloseEditBook(): void {
		// Only used for backdrop clicks: Cancel / ✕ / Escape close unconditionally.
		if (editSaving()) return
		if (isEditDirty() && !window.confirm('Discard unsaved changes?')) return
		closeEditBook()
	}

	function cleanNotes(notes: PageNote[] | undefined): PageNote[] | undefined {
		const cleaned = (notes ?? [])
			.map((n) => ({
				page: (n.page ?? '').trim().slice(0, 50),
				text: (n.text ?? '').trim().slice(0, 2000),
			}))
			.filter((n) => n.text !== '')
		return cleaned.length > 0 ? cleaned : undefined
	}

	async function saveEditedBook(e: Event): Promise<void> {
		e.preventDefault()
		setEditError(null)
		const book = editingBook()
		if (!book) return
		const f = form()
		if (!f.title.trim()) {
			setEditError('Title is required.')
			return
		}
		const parsedYear = Number.parseInt(f.printYear.trim(), 10)
		if (f.printYear.trim() && !Number.isFinite(parsedYear)) {
			setEditError('Print year must be a number.')
			return
		}
		setEditSaving(true)
		try {
			const payload: Record<string, unknown> = {
				isbn: f.isbn.trim() || undefined,
				title: f.title.trim(),
				subtitle: f.subtitle.trim() || null,
				authorIds: selectedAuthorIds(),
				publisherId: selectedPublisherId() || null,
				locationId: selectedLocationId() || null,
				printYear: Number.isFinite(parsedYear) ? parsedYear : undefined,
				tagIds: selectedTagIds(),
				dedications: cleanNotes(f.dedications),
				damages: cleanNotes(f.damages),
				languageIds: selectedLanguageIds(),
			}
			if (deps.authUser()?.isAdmin) {
				payload.ownerId = selectedOwnerId() || null
			}
			await api(`/books/${encodeURIComponent(book.id)}`, {
				method: 'PATCH',
				body: JSON.stringify(payload),
			})
			// Optional: add a lifecycle event from the edit dialog's inline form.
			if (f.provKind.trim()) {
				const cents = priceToCents(f.provPrice)
				if (f.provPrice.trim() && cents === undefined) {
					throw new Error('Provenance price must be a non-negative number.')
				}
				await api(`/books/${encodeURIComponent(book.id)}/provenance`, {
					method: 'POST',
					body: JSON.stringify({
						kind: f.provKind.trim(),
						occurredAt: f.provDate.trim() || undefined,
						party: f.provParty.trim() || undefined,
						priceCents: cents,
					}),
				})
			}
			setEditSaving(false)
			closeEditBook()
			await Promise.all([deps.refetchBooks(), deps.refetchLocations()])
		} catch (err) {
			setEditError(err instanceof Error ? err.message : 'Could not update the book.')
		} finally {
			setEditSaving(false)
		}
	}

	/**
	 * Returns true when the book was created (so the caller can close the
	 * panel and clear the inline-create inputs).
	 * When `keepForAnother` is true, title, subtitle, isbn, dedications and
	 * damages are cleared — all other fields and selections are kept.
	 */
	async function addBook(e: Event, keepForAnother = false): Promise<boolean> {
		e.preventDefault()
		setFormError(null)
		setActionError(null)
		const f = form()
		if (!f.title.trim()) {
			setFormError('Title is required.')
			return false
		}
		const parsedYear = Number.parseInt(f.printYear.trim(), 10)
		if (f.printYear.trim() && !Number.isFinite(parsedYear)) {
			setFormError('Print year must be a number.')
			return false
		}
		setSaving(true)
		try {
			if (f.provKind.trim() && !['buy', 'sell', 'other'].includes(f.provKind.trim())) {
				throw new Error('Invalid provenance kind.')
			}
			const cents = priceToCents(f.provPrice)
			if (f.provPrice.trim() && cents === undefined) {
				throw new Error('Provenance price must be a non-negative number.')
			}
			const created = await api<{ book: Book }>('/books', {
				method: 'POST',
				body: JSON.stringify({
					isbn: f.isbn.trim() || undefined,
					title: f.title.trim(),
					subtitle: f.subtitle.trim() || undefined,
					authorIds: selectedAuthorIds(),
					publisherId: selectedPublisherId() || undefined,
					locationId: selectedLocationId() || undefined,
					printYear: Number.isFinite(parsedYear) ? parsedYear : undefined,
					tagIds: selectedTagIds(),
					dedications: cleanNotes(f.dedications),
					damages: cleanNotes(f.damages),
					languageIds: selectedLanguageIds(),
				}),
			})
			if (f.provKind.trim()) {
				await api(`/books/${encodeURIComponent(created.book.id)}/provenance`, {
					method: 'POST',
					body: JSON.stringify({
						kind: f.provKind.trim(),
						occurredAt: f.provDate.trim() || undefined,
						party: f.provParty.trim() || undefined,
						priceCents: cents,
					}),
				})
			}
			if (keepForAnother) {
				resetForNextBook()
			} else {
				resetForm()
			}
			await Promise.all([deps.refetchBooks(), deps.refetchLocations()])
			return true
		} catch (err) {
			setFormError(err instanceof Error ? err.message : 'Could not save the book.')
			return false
		} finally {
			setSaving(false)
		}
	}

	async function removeBook(id: string): Promise<void> {
		if (!window.confirm('Delete this book?')) {
			return
		}
		setActionError(null)
		setDeletingId(id)
		try {
			await api(`/books/${encodeURIComponent(id)}`, { method: 'DELETE' })
			await Promise.all([deps.refetchBooks(), deps.refetchLocations()])
		} catch (err) {
			setActionError(err instanceof Error ? err.message : 'Could not delete the book.')
		} finally {
			setDeletingId(null)
		}
	}

	async function removeProvenanceEvent(bookId: string, eventId: string): Promise<void> {
		if (!window.confirm('Delete this lifecycle event?')) {
			return
		}
		setEditError(null)
		try {
			await api(`/provenance/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
			const updated = await api<{ book: Book; reading: unknown }>(
				`/books/${encodeURIComponent(bookId)}`,
			)
			setEditingBook(updated.book)
			await deps.refetchBooks()
		} catch (err) {
			setEditError(err instanceof Error ? err.message : 'Could not delete the event.')
		}
	}

	const selectedAuthorLabel = (): string => {
		const selected = (deps.getAuthors() ?? []).filter((author) =>
			selectedAuthorIds().includes(author.id),
		)
		if (selected.length === 0) return 'Select authors'
		if (selected.length <= 2) return selected.map((author) => author.name).join(', ')
		return `${selected.length} authors selected`
	}

	const selectedTagLabel = (): string => {
		const selected = (deps.getTags() ?? []).filter((tag) => selectedTagIds().includes(tag.id))
		if (selected.length === 0) return 'Select tags'
		if (selected.length <= 2) return selected.map((tag) => tag.name).join(', ')
		return `${selected.length} tags selected`
	}
	const selectedLanguageLabel = (): string => {
		const selected = (deps.getLanguages() ?? []).filter((l) => selectedLanguageIds().includes(l.id))
		if (!selected.length) return 'Select languages'
		if (selected.length <= 2) return selected.map((l) => l.name).join(', ')
		return `${selected.length} languages selected`
	}

	return {
		form,
		setField,
		setPageNotes,
		selectedAuthorIds,
		setSelectedAuthorIds,
		selectedPublisherId,
		setSelectedPublisherId,
		selectedLocationId,
		setSelectedLocationId,
		selectedTagIds,
		selectedLanguageIds,
		setSelectedLanguageIds,
		setSelectedTagIds,
		selectedOwnerId,
		setSelectedOwnerId,
		saving,
		formError,
		actionError,
		deletingId,
		editingBook,
		editSaving,
		editError,
		toggleAuthor,
		toggleTag,
		toggleLanguage,
		resetForm,
		editBook,
		closeEditBook,
		requestCloseEditBook,
		saveEditedBook,
		addBook,
		removeBook,
		removeProvenanceEvent,
		selectedAuthorLabel,
		selectedTagLabel,
		selectedLanguageLabel,
	}
}

export type BookFormStore = ReturnType<typeof useBookForm>
