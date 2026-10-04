import { DataTable, type DataTableColumn } from '@serkonda7/solid-components'
import { IconBook } from '@tabler/icons-solidjs'
import { createMemo, Show } from 'solid-js'
import { BookTitleCell } from '../components/BookTable'
import { ErrorText, LoadingRows, orDash } from '../components/common'
import { EntryLinks, type LinkedKind } from '../components/EntryLinks'
import { ReadCheckbox } from '../components/ReadCheckbox'
import { t } from '../i18n'
import { PAGE_PATHS } from '../routes'
import type { Book, NamedEntry } from '../types'
import { joinNames } from '../utils/books'

export type CatalogEntry = {
	kind: LinkedKind
	entry: NamedEntry
	books: Book[]
}

export type CatalogEntryPageProps = {
	kind: LinkedKind
	data: CatalogEntry | undefined
	loading: boolean
	loadError: string | null
	actionError: string | null
	readPendingIds: ReadonlySet<string>
	onToggleRead: (book: Book) => void
	onNavigate: (path: string, event: MouseEvent) => void
}

/** Author or publisher with the number and list of their books. */
export function CatalogEntryPage(props: CatalogEntryPageProps) {
	return (
		<div class="add-book-page">
			<nav class="breadcrumb" aria-label={t('nav.breadcrumb')}>
				<a href={PAGE_PATHS.catalog} onClick={(e) => props.onNavigate(PAGE_PATHS.catalog, e)}>
					{t('nav.catalog')}
				</a>
				<span class="breadcrumb-separator" aria-hidden="true">
					/
				</span>
				<span class="breadcrumb-current" aria-current="page">
					{props.data?.entry.name}
				</span>
			</nav>

			<ErrorText message={props.actionError} />
			<Show
				when={props.data}
				fallback={
					<Show when={!props.loading} fallback={<LoadingRows />}>
						<div class="empty">
							<p>{props.loadError ?? t(`entryPage.${props.kind}LoadError`)}</p>
						</div>
					</Show>
				}
			>
				{(data) => <EntryBooks {...props} data={data()} />}
			</Show>
		</div>
	)
}

function EntryBooks(props: Omit<CatalogEntryPageProps, 'data'> & { data: CatalogEntry }) {
	const count = () => props.data.books.length

	// Rebuilt on locale change so header labels follow the selected language.
	const columns = createMemo((): DataTableColumn<Book>[] => [
		{
			key: 'read',
			label: t('book.read'),
			sortable: true,
			sortValue: (b) => b.readAt ?? 0,
			getValue: (b) => (
				<ReadCheckbox
					book={b}
					pending={props.readPendingIds.has(b.id)}
					onToggle={props.onToggleRead}
				/>
			),
		},
		{
			key: 'title',
			label: t('book.title'),
			sortable: true,
			sortValue: (b) => b.title,
			getValue: (b) => <BookTitleCell book={b} onNavigate={props.onNavigate} />,
		},
		{
			key: 'authors',
			label: t('book.authors'),
			sortable: true,
			sortValue: (b) => joinNames(b.authors),
			getValue: (b) =>
				b.authors.length > 0 ? (
					<EntryLinks kind="author" entries={b.authors} onNavigate={props.onNavigate} />
				) : (
					<span class="muted">{t('common.unknown')}</span>
				),
		},
		{
			key: 'publisher',
			label: t('book.publisher'),
			sortable: true,
			sortValue: (b) => b.publisher?.name ?? null,
			getValue: (b) =>
				orDash(
					b.publisher && (
						<EntryLinks kind="publisher" entries={[b.publisher]} onNavigate={props.onNavigate} />
					),
				),
		},
		{
			key: 'printYear',
			label: t('book.printYear'),
			sortable: true,
			sortValue: (b) => b.printYear,
			getValue: (b) => orDash(b.printYear),
		},
	])

	return (
		<>
			<section class="library-head">
				<div>
					<p class="muted">{t(`entryPage.${props.kind}`)}</p>
					<h2>
						{props.data.entry.name}{' '}
						<span class="muted">
							{count() === 1
								? t('entryPage.bookCountOne')
								: t('entryPage.bookCount', { count: count() })}
						</span>
					</h2>
				</div>
			</section>
			<Show
				when={count() > 0}
				fallback={
					<div class="empty">
						<IconBook size={28} />
						<p class="muted">{t('entryPage.empty')}</p>
					</div>
				}
			>
				<DataTable
					rows={[...props.data.books].sort((a, b) => a.title.localeCompare(b.title))}
					columns={columns()}
					getRowId={(b) => b.id}
					class="table-wrap"
				/>
			</Show>
		</>
	)
}
