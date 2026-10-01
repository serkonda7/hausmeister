import { DataTable, type DataTableColumn } from '@serkonda7/solid-components'
import { IconEdit, IconLoader2, IconTrash } from '@tabler/icons-solidjs'
import { createEffect, createMemo, createSignal, Show } from 'solid-js'
import { t } from '../i18n'
import type { Book } from '../types'
import {
	authorNames,
	displayLanguages,
	formatPageNote,
	formatPageNotes,
	formatRecordDate,
	LIBRARY_DEFAULT_VISIBLE_COLUMNS,
	LIBRARY_VISIBLE_COLUMNS_KEY,
	loadLibraryVisibleColumns,
	locationName,
	ownerName,
	ownershipLabel,
	provenanceTooltip,
	tagNames,
} from '../utils/books'

export type BookTableProps = {
	books: Book[]
	deletingId: string | null
	currentUserId: string | null
	isAdmin: boolean
	onDelete: (id: string) => void
	onEdit: (book: Book) => void
	readPendingIds: ReadonlySet<string>
	onToggleRead: (book: Book) => void
}

export function BookTable(props: BookTableProps) {
	const [visibleColumns, setVisibleColumns] = createSignal<string[]>(loadLibraryVisibleColumns())

	createEffect(() => {
		try {
			localStorage.setItem(LIBRARY_VISIBLE_COLUMNS_KEY, JSON.stringify(visibleColumns()))
		} catch {
			// Ignore persistence failures (e.g. private browsing).
		}
	})

	function canEdit(b: Book): boolean {
		if (props.isAdmin) return true
		if (!props.currentUserId) return false
		return b.ownerId !== null && b.ownerId === props.currentUserId
	}

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
					disabled={props.readPendingIds.has(b.id)}
					onChange={() => props.onToggleRead(b)}
					aria-label={t('reading.markAria', { title: b.title })}
					title={
						b.readAt !== null
							? t('reading.readOn', { date: formatRecordDate(b.readAt) })
							: undefined
					}
				/>
			),
		},
		{
			key: 'title',
			label: t('book.title'),
			sortable: true,
			toggleable: false,
			sortValue: (b) => b.title,
			getValue: (b) => (
				<span class="book-title-cell">
					<span class="cell-title">{b.title}</span>
					<Show when={b.subtitle}>
						<span class="cell-subtitle">{b.subtitle}</span>
					</Show>
				</span>
			),
		},
		{
			key: 'isbn',
			label: t('book.isbn'),
			sortable: true,
			defaultVisible: false,
			sortValue: (b) => b.isbn,
			getValue: (b) => (
				<Show when={b.isbn} fallback={<span class="muted">—</span>}>
					{b.isbn}
				</Show>
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
			key: 'printYear',
			label: t('book.printYear'),
			sortable: true,
			sortValue: (b) => b.printYear,
			getValue: (b) => b.printYear ?? <span class="muted">—</span>,
		},
		{
			key: 'publisher',
			label: t('book.publisher'),
			sortable: true,
			sortValue: (b) => b.publisher?.name,
			getValue: (b) => b.publisher?.name ?? <span class="muted">—</span>,
		},
		{
			key: 'location',
			label: t('book.location'),
			sortable: true,
			sortValue: locationName,
			getValue: (b) => (
				<Show when={locationName(b)} fallback={<span class="muted">—</span>}>
					{locationName(b)}
				</Show>
			),
		},
		{
			key: 'owner',
			label: t('book.owner'),
			sortable: true,
			sortValue: ownerName,
			getValue: (b) => (
				<Show when={ownerName(b)} fallback={<span class="muted">—</span>}>
					{ownerName(b)}
				</Show>
			),
		},
		{
			key: 'languages',
			label: t('catalog.languages'),
			sortable: true,
			sortValue: displayLanguages,
			getValue: (b) => (
				<Show when={displayLanguages(b)} fallback={<span class="muted">—</span>}>
					{displayLanguages(b)}
				</Show>
			),
		},
		{
			key: 'tags',
			label: t('catalog.tags'),
			sortable: true,
			sortValue: tagNames,
			getValue: (b) => (
				<Show when={tagNames(b)} fallback={<span class="muted">—</span>}>
					{tagNames(b)}
				</Show>
			),
		},
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
		{
			key: 'dedications',
			label: t('book.dedications'),
			sortable: true,
			sortValue: (b) => formatPageNotes(b.dedications),
			getValue: (b) => (
				<Show when={(b.dedications ?? []).length > 0} fallback={<span class="muted">—</span>}>
					<ul class="cell-notes">
						{(b.dedications ?? []).map((n) => (
							<li>{formatPageNote(n)}</li>
						))}
					</ul>
				</Show>
			),
		},
		{
			key: 'damages',
			label: t('book.damages'),
			sortable: true,
			sortValue: (b) => formatPageNotes(b.damages),
			getValue: (b) => (
				<Show when={(b.damages ?? []).length > 0} fallback={<span class="muted">—</span>}>
					<ul class="cell-notes damages">
						{(b.damages ?? []).map((n) => (
							<li>{formatPageNote(n)}</li>
						))}
					</ul>
				</Show>
			),
		},
		{
			key: 'added',
			label: t('book.added'),
			sortable: true,
			sortValue: (b) => b.createdAt,
			getValue: (b) => (
				<Show when={formatRecordDate(b.createdAt)} fallback={<span class="muted">—</span>}>
					{formatRecordDate(b.createdAt)}
				</Show>
			),
		},
		{
			key: 'modified',
			label: t('book.modified'),
			sortable: true,
			sortValue: (b) => b.updatedAt,
			getValue: (b) => (
				<Show when={formatRecordDate(b.updatedAt)} fallback={<span class="muted">—</span>}>
					{formatRecordDate(b.updatedAt)}
				</Show>
			),
		},
	])

	return (
		<DataTable
			rows={props.books}
			columns={columns()}
			getRowId={(b) => b.id}
			class="table-wrap"
			onSort={() => undefined}
			visibleColumns={visibleColumns}
			defaultVisibleColumns={LIBRARY_DEFAULT_VISIBLE_COLUMNS}
			onVisibleColumnsChange={setVisibleColumns}
			showColumnCustomizer
			columnCustomizerLabel={t('library.columns')}
			columnCustomizerTitle={t('library.columnsTitle')}
			columnCustomizerShowAllLabel={t('library.columnsShowAll')}
			columnCustomizerResetLabel={t('library.columnsReset')}
			rowActions={(b) => (
				<div class="cell-actions">
					<Show
						when={canEdit(b)}
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
			)}
		/>
	)
}
