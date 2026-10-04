import { IconEdit, IconExternalLink, IconLoader2, IconTrash } from '@tabler/icons-solidjs'
import { canEditBook } from 'shared/src/book'
import { For, type JSX, Show } from 'solid-js'
import { ErrorText, LoadingRows, orDash } from '../components/common'
import { EntryLinks } from '../components/EntryLinks'
import { ReadCheckbox } from '../components/ReadCheckbox'
import { t } from '../i18n'
import { PAGE_PATHS } from '../routes'
import type { Book, NamedEntry, PageNote, PublicUser } from '../types'
import {
	formatPageNote,
	formatRecordDate,
	joinNames,
	locationName,
	ownerName,
	ownershipLabel,
	provenanceDetails,
	provenanceLabel,
} from '../utils/books'

export type BookPageProps = {
	book: Book | undefined
	loading: boolean
	loadError: string | null
	user: PublicUser
	actionError: string | null
	deletingId: string | null
	readPending: boolean
	onNavigate: (path: string, event: MouseEvent) => void
	onEdit: (book: Book) => void
	onDelete: (book: Book) => void
	onToggleRead: (book: Book) => void
}

export function BookPage(props: BookPageProps) {
	return (
		<div class="add-book-page">
			<nav class="breadcrumb" aria-label={t('nav.breadcrumb')}>
				<a href={PAGE_PATHS.library} onClick={(e) => props.onNavigate(PAGE_PATHS.library, e)}>
					{t('nav.library')}
				</a>
				<span class="breadcrumb-separator" aria-hidden="true">
					/
				</span>
				<span class="breadcrumb-current" aria-current="page">
					{props.book?.title}
				</span>
			</nav>

			<ErrorText message={props.actionError} />
			<Show when={props.book} fallback={<BookPageFallback {...props} />}>
				{(book) => <BookDetails {...props} book={book()} />}
			</Show>
		</div>
	)
}

function BookPageFallback(props: { loading: boolean; loadError: string | null }) {
	return (
		<Show when={!props.loading} fallback={<LoadingRows />}>
			<div class="empty">
				<p>{props.loadError ?? t('bookPage.loadError')}</p>
			</div>
		</Show>
	)
}

function BookDetails(props: Omit<BookPageProps, 'book'> & { book: Book }) {
	const b = () => props.book
	const deleting = () => props.deletingId === b().id

	const actions = (
		<div class="book-page-actions">
			<span class="book-page-read">
				<ReadCheckbox book={b()} pending={props.readPending} onToggle={props.onToggleRead} />
				<span>
					{b().readAt === null
						? t('book.read')
						: t('reading.readOn', { date: formatRecordDate(b().readAt) })}
				</span>
			</span>
			<Show when={b().isbn}>
				{(isbn) => (
					<a
						class="btn ghost"
						href={`https://openlibrary.org/isbn/${encodeURIComponent(isbn().replace(/[\s-]/g, ''))}`}
						target="_blank"
						rel="noopener noreferrer"
					>
						<IconExternalLink size={16} /> {t('bookPage.openLibrary')}
					</a>
				)}
			</Show>
			<Show when={canEditBook(b(), props.user)}>
				<button type="button" class="ghost" onClick={() => props.onEdit(b())}>
					<IconEdit size={16} /> {t('common.edit')}
				</button>
				<button
					type="button"
					class="danger-ghost"
					disabled={deleting()}
					onClick={() => props.onDelete(b())}
				>
					<Show when={deleting()} fallback={<IconTrash size={16} />}>
						<IconLoader2 size={16} class="spin" />
					</Show>{' '}
					{t('library.deleteBook')}
				</button>
			</Show>
		</div>
	)

	return (
		<article class="panel book-page">
			<header class="book-page-head">
				<Show when={b().coverUrl}>
					{(url) => (
						<img class="book-cover" src={url()} alt={t('bookPage.cover', { title: b().title })} />
					)}
				</Show>
				<div class="book-page-heading">
					<h2>{b().title}</h2>
					<Show when={b().subtitle}>
						<p class="book-page-subtitle">{b().subtitle}</p>
					</Show>
					<p class="muted">
						<Show when={b().authors.length > 0} fallback={t('common.unknown')}>
							<EntryLinks kind="author" entries={b().authors} onNavigate={props.onNavigate} />
						</Show>
					</p>
					{actions}
				</div>
			</header>

			<Show when={b().description}>
				<p class="book-description">{b().description}</p>
			</Show>

			<dl class="book-details">
				<Detail label={t('book.isbn')}>{b().isbn}</Detail>
				<Detail label={t('book.publisher')}>
					{b().publisher && (
						<EntryLinks
							kind="publisher"
							entries={[b().publisher as NamedEntry]}
							onNavigate={props.onNavigate}
						/>
					)}
				</Detail>
				<Detail label={t('book.printYear')}>{b().printYear}</Detail>
				<Detail label={t('catalog.languages')}>{joinNames(b().languages)}</Detail>
				<Detail label={t('catalog.tags')}>{joinNames(b().tags)}</Detail>
				<Detail label={t('book.location')}>{locationName(b())}</Detail>
				<Detail label={t('book.owner')}>{ownerName(b())}</Detail>
				<Detail label={t('book.status')}>
					<span class={`status status-${b().ownership}`}>{ownershipLabel(b().ownership)}</span>
				</Detail>
				<Detail label={t('book.added')}>{formatRecordDate(b().createdAt)}</Detail>
				<Detail label={t('book.modified')}>{formatRecordDate(b().updatedAt)}</Detail>
				<Detail label={t('book.dedications')}>
					{b().dedications.length > 0 && <NoteList notes={b().dedications} />}
				</Detail>
				<Detail label={t('book.damages')}>
					{b().damages.length > 0 && <NoteList notes={b().damages} class="damages" />}
				</Detail>
			</dl>

			<section class="field-group">
				<h3 class="field-label">
					{t('editBook.lifecycle')} ({b().provenance.length})
				</h3>
				<Show
					when={b().provenance.length > 0}
					fallback={<p class="muted small">{t('editBook.noEvents')}</p>}
				>
					<ul class="cell-notes">
						<For each={b().provenance}>
							{(e) => (
								<li>
									<strong>{provenanceLabel(e.kind)}</strong>
									<For each={provenanceDetails(e)}>{(part) => ` · ${part}`}</For>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>
		</article>
	)
}

function Detail(props: { label: string; children: JSX.Element }) {
	return (
		<div>
			<dt>{props.label}</dt>
			<dd>{orDash(props.children)}</dd>
		</div>
	)
}

function NoteList(props: { notes: PageNote[]; class?: string }) {
	return (
		<ul class={props.class ? `cell-notes ${props.class}` : 'cell-notes'}>
			<For each={props.notes}>{(n) => <li>{formatPageNote(n)}</li>}</For>
		</ul>
	)
}
