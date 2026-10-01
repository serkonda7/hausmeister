import { DataTable, type DataTableColumn } from '@serkonda7/solid-components'
import { IconBook } from '@tabler/icons-solidjs'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { t } from '../i18n'
import type { Book } from '../types'
import { authorNames, formatRecordDate } from '../utils/books'

type ReadFilter = 'all' | 'unread' | 'read'

const FILTERS: ReadFilter[] = ['all', 'unread', 'read']

export type ReadingListPageProps = {
	debouncedQuery: string
	booksLoading: boolean
	booksError: unknown
	books: Book[]
	pendingIds: ReadonlySet<string>
	error: string | null
	onToggleRead: (book: Book) => void
}

export function ReadingListPage(props: ReadingListPageProps) {
	const [filter, setFilter] = createSignal<ReadFilter>('all')

	const readCount = createMemo(() => props.books.filter((b) => b.readAt !== null).length)

	// Unread first (alphabetical), then read books with the most recently read on top.
	const visibleBooks = createMemo(() => {
		const f = filter()
		return props.books
			.filter((b) => f === 'all' || (f === 'read') === (b.readAt !== null))
			.sort((a, b) => {
				if ((a.readAt === null) !== (b.readAt === null)) return a.readAt === null ? -1 : 1
				if (a.readAt !== null && b.readAt !== null && a.readAt !== b.readAt) {
					return b.readAt - a.readAt
				}
				return a.title.localeCompare(b.title)
			})
	})

	// Rebuilt on locale change so header labels follow the selected language.
	const columns = createMemo((): DataTableColumn<Book>[] => [
		{
			key: 'read',
			label: t('book.read'),
			sortable: true,
			sortValue: (b) => b.readAt ?? 0,
			getValue: (b) => (
				<input
					type="checkbox"
					class="read-checkbox"
					checked={b.readAt !== null}
					disabled={props.pendingIds.has(b.id)}
					onChange={() => props.onToggleRead(b)}
					aria-label={t('reading.markAria', { title: b.title })}
				/>
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
		{
			key: 'authors',
			label: t('book.authors'),
			sortable: true,
			sortValue: authorNames,
			getValue: (b) => (
				<Show
					when={(b.authors ?? []).length > 0}
					fallback={<span class="muted">{t('common.unknown')}</span>}
				>
					{authorNames(b)}
				</Show>
			),
		},
		{
			key: 'readAt',
			label: t('reading.readAt'),
			sortable: true,
			sortValue: (b) => b.readAt ?? 0,
			getValue: (b) => (
				<Show when={formatRecordDate(b.readAt)} fallback={<span class="muted">—</span>}>
					{formatRecordDate(b.readAt)}
				</Show>
			),
		},
	])

	const percent = () =>
		props.books.length === 0 ? 0 : Math.round((readCount() / props.books.length) * 100)

	return (
		<>
			<section class="library-head">
				<h2>
					{t('nav.reading')}{' '}
					<Show when={!props.booksLoading && !props.booksError}>
						<span class="muted">
							{t('reading.progress', { read: readCount(), total: props.books.length })}
						</span>
					</Show>
				</h2>
				<Show when={props.debouncedQuery}>
					<p class="muted">
						{t('library.resultsFor')} “<strong>{props.debouncedQuery}</strong>”
					</p>
				</Show>
			</section>

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

			<Show when={props.error}>
				<p class="error">{props.error}</p>
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
					<p>{t('library.loadError')}</p>
					<button type="button" class="ghost" onClick={() => window.location.reload()}>
						{t('library.reload')}
					</button>
				</div>
			</Show>

			<Show when={!props.booksLoading && !props.booksError}>
				<Show
					when={visibleBooks().length > 0}
					fallback={
						<div class="empty">
							<IconBook size={28} />
							<p class="muted">
								{props.books.length === 0
									? t('library.emptyTitle')
									: filter() === 'read'
										? t('reading.emptyRead')
										: t('reading.emptyUnread')}
							</p>
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
			</Show>
		</>
	)
}
