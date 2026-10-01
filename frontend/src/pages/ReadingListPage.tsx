import { DataTable, type DataTableColumn } from '@serkonda7/solid-components'
import { IconBook } from '@tabler/icons-solidjs'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { authorsColumn } from '../components/BookTable'
import { orDash } from '../components/common'
import { ReadCheckbox } from '../components/ReadCheckbox'
import { t } from '../i18n'
import type { Book } from '../types'
import { formatRecordDate } from '../utils/books'
import { BookListFrame, type BookListState } from './LibraryPage'

type ReadFilter = 'all' | 'unread' | 'read'

const FILTERS: ReadFilter[] = ['all', 'unread', 'read']

/** Unread first (alphabetical), then read books with the most recently read on top. */
function readingOrder(a: Book, b: Book): number {
	if ((a.readAt === null) !== (b.readAt === null)) return a.readAt === null ? -1 : 1
	if (a.readAt !== b.readAt) return (b.readAt ?? 0) - (a.readAt ?? 0)
	return a.title.localeCompare(b.title)
}

export type ReadingListPageProps = BookListState & {
	books: Book[]
	pendingIds: ReadonlySet<string>
	error: string | null
	onToggleRead: (book: Book) => void
}

export function ReadingListPage(props: ReadingListPageProps) {
	const [filter, setFilter] = createSignal<ReadFilter>('all')
	const readCount = createMemo(() => props.books.filter((b) => b.readAt !== null).length)
	const percent = () =>
		props.books.length === 0 ? 0 : Math.round((readCount() / props.books.length) * 100)
	const visibleBooks = createMemo(() =>
		props.books
			.filter((b) => filter() === 'all' || (filter() === 'read') === (b.readAt !== null))
			.sort(readingOrder),
	)

	// Rebuilt on locale change so header labels follow the selected language.
	const columns = createMemo((): DataTableColumn<Book>[] => [
		{
			key: 'read',
			label: t('book.read'),
			sortable: true,
			sortValue: (b) => b.readAt ?? 0,
			getValue: (b) => (
				<ReadCheckbox book={b} pending={props.pendingIds.has(b.id)} onToggle={props.onToggleRead} />
			),
		},
		{
			key: 'title',
			label: t('book.title'),
			sortable: true,
			sortValue: (b) => b.title,
			getValue: (b) => (
				<span class="cell-title" classList={{ muted: b.readAt !== null }}>
					{b.title}
				</span>
			),
		},
		authorsColumn(),
		{
			key: 'readAt',
			label: t('reading.readAt'),
			sortable: true,
			sortValue: (b) => b.readAt ?? 0,
			getValue: (b) => orDash(formatRecordDate(b.readAt)),
		},
	])

	const emptyMessage = () => {
		if (props.books.length === 0) return t('library.emptyTitle')
		return filter() === 'read' ? t('reading.emptyRead') : t('reading.emptyUnread')
	}

	const controls = (
		<Show when={!props.booksLoading && !props.booksError && props.books.length > 0}>
			<section class="controls reading-controls">
				<div
					class="reading-progress"
					role="progressbar"
					aria-label={t('reading.progressAria')}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={percent()}
				>
					<div class="reading-progress-bar" style={{ width: `${percent()}%` }} />
				</div>
				<fieldset class="segmented" aria-label={t('reading.filterAria')}>
					<For each={FILTERS}>
						{(f) => (
							<button
								type="button"
								class={filter() === f ? 'primary' : 'ghost'}
								aria-pressed={filter() === f}
								onClick={() => setFilter(f)}
							>
								{t(`reading.filter.${f}`)}
							</button>
						)}
					</For>
				</fieldset>
			</section>
		</Show>
	)

	return (
		<BookListFrame
			{...props}
			title={t('nav.reading')}
			count={t('reading.progress', { read: readCount(), total: props.books.length })}
			controls={controls}
		>
			<Show
				when={visibleBooks().length > 0}
				fallback={
					<div class="empty">
						<IconBook size={28} />
						<p class="muted">{emptyMessage()}</p>
					</div>
				}
			>
				<DataTable
					rows={visibleBooks()}
					columns={columns()}
					getRowId={(b) => b.id}
					class="table-wrap reading-table"
				/>
			</Show>
		</BookListFrame>
	)
}
