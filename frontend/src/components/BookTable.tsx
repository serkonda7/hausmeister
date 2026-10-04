import { DataTable, type DataTableColumn } from '@serkonda7/solid-components'
import { IconEdit, IconLoader2, IconTrash } from '@tabler/icons-solidjs'
import { canEditBook } from 'shared/src/book'
import { createEffect, createMemo, createSignal, For, type JSX, Show } from 'solid-js'
import { t } from '../i18n'
import { bookPath } from '../routes'
import type { Book, PageNote, PublicUser } from '../types'
import {
	formatPageNote,
	formatPageNotes,
	formatRecordDate,
	joinNames,
	locationName,
	ownerName,
	ownershipLabel,
	provenanceTooltip,
} from '../utils/books'
import { loadStored, store } from '../utils/storage'
import { orDash } from './common'
import { ReadCheckbox } from './ReadCheckbox'

const VISIBLE_COLUMNS_KEY = 'hausmeister.library.visibleColumns'

const DEFAULT_VISIBLE_COLUMNS = [
	'read',
	'title',
	'authors',
	'printYear',
	'publisher',
	'location',
	'owner',
	'languages',
	'tags',
	'provenance',
	'dedications',
	'damages',
	'added',
	'modified',
]

const KNOWN_COLUMNS = [...DEFAULT_VISIBLE_COLUMNS, 'isbn']

function loadVisibleColumns(): string[] {
	try {
		const parsed: unknown = JSON.parse(loadStored(VISIBLE_COLUMNS_KEY) ?? 'null')
		if (Array.isArray(parsed)) return parsed.filter((key) => KNOWN_COLUMNS.includes(key))
	} catch {
		// Corrupt value: fall back to the defaults.
	}
	return [...DEFAULT_VISIBLE_COLUMNS]
}

/** Sortable text column; `text` is both the cell content and the sort key. */
function textColumn(key: string, label: string, text: (b: Book) => string): DataTableColumn<Book> {
	return {
		key,
		label,
		sortable: true,
		sortValue: (b) => text(b) || null,
		getValue: (b) => orDash(text(b)),
	}
}

function notesColumn(key: 'dedications' | 'damages', label: string): DataTableColumn<Book> {
	const notes = (b: Book): PageNote[] => b[key]
	return {
		key,
		label,
		sortable: true,
		sortValue: (b) => formatPageNotes(notes(b)),
		getValue: (b) =>
			orDash(
				notes(b).length > 0 && (
					<ul class={key === 'damages' ? 'cell-notes damages' : 'cell-notes'}>
						<For each={notes(b)}>{(n) => <li>{formatPageNote(n)}</li>}</For>
					</ul>
				),
			),
	}
}

export type BookTableProps = {
	books: Book[]
	user: PublicUser
	deletingId: string | null
	onDelete: (id: string) => void
	onEdit: (book: Book) => void
	readPendingIds: ReadonlySet<string>
	onToggleRead: (book: Book) => void
	onNavigate: (path: string, event: MouseEvent) => void
}

export function BookTable(props: BookTableProps) {
	const [visibleColumns, setVisibleColumns] = createSignal(loadVisibleColumns())
	createEffect(() => store(VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns())))

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
			toggleable: false,
			sortValue: (b) => b.title,
			getValue: (b) => <BookTitleCell book={b} onNavigate={props.onNavigate} />,
		},
		{ ...textColumn('isbn', t('book.isbn'), (b) => b.isbn ?? ''), defaultVisible: false },
		authorsColumn(),
		{
			key: 'printYear',
			label: t('book.printYear'),
			sortable: true,
			sortValue: (b) => b.printYear,
			getValue: (b) => orDash(b.printYear),
		},
		textColumn('publisher', t('book.publisher'), (b) => b.publisher?.name ?? ''),
		textColumn('location', t('book.location'), locationName),
		textColumn('owner', t('book.owner'), ownerName),
		textColumn('languages', t('catalog.languages'), (b) => joinNames(b.languages)),
		textColumn('tags', t('catalog.tags'), (b) => joinNames(b.tags)),
		{
			key: 'provenance',
			label: t('book.status'),
			sortable: true,
			sortValue: (b) => ownershipLabel(b.ownership),
			getValue: (b) => (
				<span title={provenanceTooltip(b)}>
					<span class={`status status-${b.ownership}`}>{ownershipLabel(b.ownership)}</span>
				</span>
			),
		},
		notesColumn('dedications', t('book.dedications')),
		notesColumn('damages', t('book.damages')),
		{
			...textColumn('added', t('book.added'), (b) => formatRecordDate(b.createdAt)),
			sortValue: (b) => b.createdAt,
		},
		{
			...textColumn('modified', t('book.modified'), (b) => formatRecordDate(b.updatedAt)),
			sortValue: (b) => b.updatedAt,
		},
	])

	const rowActions = (b: Book): JSX.Element => (
		<div class="cell-actions">
			<Show
				when={canEditBook(b, props.user)}
				fallback={
					<span
						class="muted small"
						title={t('library.ownedBy', { name: ownerName(b) || t('library.someoneElse') })}
					>
						{t('library.readOnly')}
					</span>
				}
			>
				<button
					type="button"
					class="ghost icon-btn"
					onClick={() => props.onEdit(b)}
					aria-label={t('library.editAria', { title: b.title })}
					title={t('library.editBook')}
				>
					<IconEdit size={15} />
				</button>
				<button
					type="button"
					class="danger-ghost icon-btn"
					disabled={props.deletingId === b.id}
					onClick={() => props.onDelete(b.id)}
					aria-label={t('library.deleteAria', { title: b.title })}
					title={t('library.deleteBook')}
				>
					<Show when={props.deletingId === b.id} fallback={<IconTrash size={15} />}>
						<IconLoader2 size={15} class="spin" />
					</Show>
				</button>
			</Show>
		</div>
	)

	return (
		<DataTable
			rows={props.books}
			columns={columns()}
			getRowId={(b) => b.id}
			class="table-wrap"
			onSort={() => undefined}
			visibleColumns={visibleColumns}
			defaultVisibleColumns={DEFAULT_VISIBLE_COLUMNS}
			onVisibleColumnsChange={setVisibleColumns}
			showColumnCustomizer
			columnCustomizerLabel={t('library.columns')}
			columnCustomizerTitle={t('library.columnsTitle')}
			columnCustomizerShowAllLabel={t('library.columnsShowAll')}
			columnCustomizerResetLabel={t('library.columnsReset')}
			rowActions={rowActions}
		/>
	)
}

/** Author names; books without authors show "Unknown". Shared with the reading list. */
export function authorsColumn(): DataTableColumn<Book> {
	return {
		key: 'authors',
		label: t('book.authors'),
		sortable: true,
		sortValue: (b) => joinNames(b.authors),
		getValue: (b) => joinNames(b.authors) || <span class="muted">{t('common.unknown')}</span>,
	}
}

/** Title linking to the book page, with the subtitle below. Shared with the reading list. */
export function BookTitleCell(props: {
	book: Book
	muted?: boolean
	onNavigate: (path: string, event: MouseEvent) => void
}) {
	const path = () => bookPath(props.book.id)
	return (
		<span class="book-title-cell">
			<a
				href={path()}
				class="cell-title book-link"
				classList={{ muted: props.muted }}
				onClick={(e) => props.onNavigate(path(), e)}
			>
				{props.book.title}
			</a>
			<Show when={props.book.subtitle}>
				<span class="cell-subtitle">{props.book.subtitle}</span>
			</Show>
		</span>
	)
}
