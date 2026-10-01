import { createSignal } from 'solid-js'
import { api } from '../api'
import { t } from '../i18n'
import type { Book } from '../types'

export type ReadingListDeps = {
	/** Patch the cached book list in place so toggling doesn't refetch everything. */
	mutateBooks: (update: (books: Book[] | undefined) => Book[] | undefined) => unknown
}

/** Personal reading list: mark books as read / unread for the logged-in user. */
export function useReadingList(deps: ReadingListDeps) {
	const [pendingIds, setPendingIds] = createSignal<ReadonlySet<string>>(new Set())
	const [readError, setReadError] = createSignal<string | null>(null)

	function setReadAt(bookId: string, readAt: number | null): void {
		deps.mutateBooks((books) => books?.map((b) => (b.id === bookId ? { ...b, readAt } : b)))
	}

	function setPending(bookId: string, pending: boolean): void {
		setPendingIds((prev) => {
			const next = new Set(prev)
			if (pending) next.add(bookId)
			else next.delete(bookId)
			return next
		})
	}

	async function toggleRead(book: Book): Promise<void> {
		if (pendingIds().has(book.id)) return
		const wasRead = book.readAt !== null
		setReadError(null)
		setPending(book.id, true)
		// Optimistic: flip immediately, reconcile with the server's timestamp.
		setReadAt(book.id, wasRead ? null : Date.now())
		try {
			const data = await api<{ readAt: number | null }>(
				`/books/${encodeURIComponent(book.id)}/read`,
				{ method: wasRead ? 'DELETE' : 'PUT' },
			)
			setReadAt(book.id, data.readAt)
		} catch (err) {
			setReadAt(book.id, book.readAt)
			setReadError(err instanceof Error ? err.message : t('reading.toggleFailed'))
		} finally {
			setPending(book.id, false)
		}
	}

	return {
		pendingIds,
		readError,
		toggleRead,
	}
}

export type ReadingListStore = ReturnType<typeof useReadingList>
