import { IconPlus, IconTag } from '@tabler/icons-solidjs'
import { type JSX, Show } from 'solid-js'
import { BookTable, type BookTableProps } from '../components/BookTable'
import { ErrorText, LoadError, LoadingRows, SearchSummary } from '../components/common'
import { t } from '../i18n'
import { PAGE_PATHS } from '../routes'

export type BookListState = {
	debouncedQuery: string
	booksLoading: boolean
	booksError: unknown
}

/** Heading, error and loading states shared by the library and the reading list. */
export function BookListFrame(
	props: BookListState & {
		title: string
		/** Shown next to the title once the books are loaded. */
		count: JSX.Element
		controls?: JSX.Element
		error: string | null
		children: JSX.Element
	},
) {
	const loaded = () => !props.booksLoading && !props.booksError
	return (
		<>
			<section class="library-head">
				<h2>
					{props.title}{' '}
					<Show when={loaded()}>
						<span class="muted">{props.count}</span>
					</Show>
				</h2>
				<SearchSummary query={props.debouncedQuery} />
			</section>
			{props.controls}
			<ErrorText message={props.error} />
			<Show when={props.booksLoading}>
				<LoadingRows />
			</Show>
			<Show when={!props.booksLoading && props.booksError}>
				<LoadError />
			</Show>
			<Show when={loaded()}>{props.children}</Show>
		</>
	)
}

export type LibraryPageProps = BookListState &
	BookTableProps & {
		actionError: string | null
		onNavigate: (path: string, event: MouseEvent) => void
	}

export function LibraryPage(props: LibraryPageProps) {
	const addBookLink = (
		<a
			href={PAGE_PATHS['add-book']}
			class="btn primary"
			onClick={(e) => props.onNavigate(PAGE_PATHS['add-book'], e)}
		>
			<IconPlus size={16} /> {t('library.addBook')}
		</a>
	)

	return (
		<BookListFrame
			{...props}
			title={t('nav.library')}
			count={`(${props.books.length})`}
			error={props.actionError}
			controls={
				<section class="controls">
					<div class="controls-row">{addBookLink}</div>
				</section>
			}
		>
			<Show
				when={props.books.length > 0}
				fallback={
					<div class="empty">
						<IconTag size={28} />
						<h3>{t('library.emptyTitle')}</h3>
						<p class="muted">{t('library.emptyHint')}</p>
						{addBookLink}
					</div>
				}
			>
				<BookTable {...props} />
			</Show>
		</BookListFrame>
	)
}
