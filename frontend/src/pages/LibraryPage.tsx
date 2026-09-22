import { IconPlus, IconTag } from '@tabler/icons-solidjs'
import { Show } from 'solid-js'
import { BookTable } from '../components/BookTable'
import type { Book } from '../types'

export type LibraryPageProps = {
	debouncedQuery: string
	onNavigate: (path: string, event: MouseEvent) => void
	actionError: string | null
	booksLoading: boolean
	booksError: unknown
	books: Book[]
	deletingId: string | null
	currentUserId: string | null
	isAdmin: boolean
	onDeleteBook: (id: string) => void
	onEditBook: (book: Book) => void
}

export function LibraryPage(props: LibraryPageProps) {
	return (
		<>
			<section class="library-head">
				<h2>
					Library{' '}
					<Show when={!props.booksLoading && !props.booksError}>
						<span class="muted">({props.books.length})</span>
					</Show>
				</h2>
				<Show when={props.debouncedQuery}>
					<p class="muted">
						Results for “<strong>{props.debouncedQuery}</strong>”
					</p>
				</Show>
			</section>

			<section class="controls">
				<div class="controls-row">
					<a
						href="/library/add"
						class="btn primary"
						onClick={(e) => props.onNavigate('/library/add', e)}
					>
						<IconPlus size={16} />
						Add book
					</a>
				</div>
			</section>

			<Show when={props.actionError}>
				<p class="error">{props.actionError}</p>
			</Show>

			<Show when={props.booksLoading}>
				<div class="table-wrap">
					<div class="skeleton skeleton-row" />
					<div class="skeleton skeleton-row" />
					<div class="skeleton skeleton-row" />
				</div>
			</Show>

			<Show when={!props.booksLoading && props.booksError}>
				<div class="empty">
					<p>Could not load books.</p>
					<button type="button" class="ghost" onClick={() => window.location.reload()}>
						Reload
					</button>
				</div>
			</Show>

			<Show when={!props.booksLoading && !props.booksError}>
				<Show
					when={props.books.length > 0}
					fallback={
						<div class="empty">
							<IconTag size={28} />
							<h3>No books yet</h3>
							<p class="muted">Add your first book to start the collection.</p>
							<a
								href="/library/add"
								class="btn primary"
								onClick={(e) => props.onNavigate('/library/add', e)}
							>
								<IconPlus size={16} /> Add book
							</a>
						</div>
					}
				>
					<BookTable
						books={props.books}
						deletingId={props.deletingId}
						currentUserId={props.currentUserId}
						isAdmin={props.isAdmin}
						onDelete={props.onDeleteBook}
						onEdit={props.onEditBook}
					/>
				</Show>
			</Show>
		</>
	)
}
