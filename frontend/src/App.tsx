import '@serkonda7/solid-components/styles.css'
import { type Accessor, createEffect, createSignal, Match, onCleanup, Show, Switch } from 'solid-js'
import { AuthDialog, AuthLoading } from './components/AuthViews'
import { EditBookDialog } from './components/EditBookDialog'
import { Layout } from './components/Layout'
import { useAuth } from './hooks/useAuth'
import { useBookForm } from './hooks/useBookForm'
import {
	type CatalogKind,
	createCatalogLists,
	createList,
	createUserList,
	useCatalogActions,
} from './hooks/useCatalog'
import { useReadingList } from './hooks/useReadingList'
import { useUserManagement } from './hooks/useUserManagement'
import { t } from './i18n'
import { AddBookPage } from './pages/AddBookPage'
import { CatalogPage } from './pages/CatalogPage'
import { LibraryPage } from './pages/LibraryPage'
import { LocationsPage } from './pages/LocationsPage'
import { ReadingListPage } from './pages/ReadingListPage'
import { EditUserDialog, UsersPage } from './pages/UsersPage'
import { PAGE_PATHS, type Page, pageFromPath } from './routes'
import type { Book, PublicUser } from './types'

export default function App() {
	const [page, setPage] = createSignal<Page>(pageFromPath(window.location.pathname))
	const [query, setQuery] = createSignal('')
	const [debouncedQuery, setDebouncedQuery] = createSignal('')

	const auth = useAuth()
	const userId = () => auth.user()?.id ?? null

	const books = createList<Book>(
		() => userId() && `${userId()}:${debouncedQuery()}`,
		() => `/books?q=${encodeURIComponent(debouncedQuery())}`,
	)
	const lists = createCatalogLists(userId)
	const users = createUserList(auth.user)

	/** Reload books and the catalog lists, whose book counts may have changed. */
	function refreshBooks() {
		return Promise.all([books.refetch(), ...Object.values(lists).map((list) => list.refetch())])
	}

	const book = useBookForm({ user: auth.user, refresh: refreshBooks })
	const catalog = useCatalogActions({
		lists,
		refetchBooks: books.refetch,
		onRemoved: book.deselect,
	})
	const reading = useReadingList({ mutateBooks: books.mutate })
	const userManagement = useUserManagement({
		user: auth.user,
		setUser: auth.setUser,
		refresh: () => Promise.all([users.refetch(), books.refetch()]),
	})

	/** Inline create from a book form: the new entry gets selected. */
	async function createAndSelect(kind: CatalogKind, name: string): Promise<void> {
		// New locations nest under the currently selected one.
		const parentId = kind === 'locations' ? book.form().locationId : undefined
		const entry = await catalog.create(kind, name, parentId)
		if (entry) book.select(kind, entry.id)
	}

	function navigateTo(path: string): void {
		window.history.pushState({}, '', path)
		setPage(pageFromPath(path))
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	function navigate(path: string, event: MouseEvent): void {
		event.preventDefault()
		navigateTo(path)
	}

	async function handleLogout(): Promise<void> {
		await auth.logout()
		navigateTo(PAGE_PATHS.library)
	}

	async function saveNewBook(another: boolean): Promise<boolean> {
		const ok = await book.addBook(another)
		if (ok && !another) navigateTo(PAGE_PATHS.library)
		return ok
	}

	function cancelAddBook(): void {
		book.resetForm()
		navigateTo(PAGE_PATHS.library)
	}

	const onPopState = () => setPage(pageFromPath(window.location.pathname))
	window.addEventListener('popstate', onPopState)
	onCleanup(() => window.removeEventListener('popstate', onPopState))

	createEffect(() => {
		const q = query()
		const timer = setTimeout(() => setDebouncedQuery(q.trim()), 250)
		onCleanup(() => clearTimeout(timer))
	})

	const bookFieldProps = { book, lists, onCreate: createAndSelect }
	const bookListState = {
		get debouncedQuery() {
			return debouncedQuery()
		},
		get booksLoading() {
			return books.loading()
		},
		get booksError() {
			return books.error()
		},
		get books() {
			return books.items()
		},
	}

	const currentPage = (user: Accessor<PublicUser>) => (
		<Switch>
			<Match when={page() === 'library'}>
				<LibraryPage
					{...bookListState}
					user={user()}
					onNavigate={navigate}
					actionError={book.actionError()}
					deletingId={book.deletingId()}
					onDelete={(id) => void book.removeBook(id)}
					onEdit={book.editBook}
					readPendingIds={reading.pendingIds()}
					onToggleRead={(b) => void reading.toggleRead(b)}
				/>
			</Match>
			<Match when={page() === 'reading'}>
				<ReadingListPage
					{...bookListState}
					pendingIds={reading.pendingIds()}
					error={reading.readError()}
					onToggleRead={(b) => void reading.toggleRead(b)}
				/>
			</Match>
			<Match when={page() === 'add-book'}>
				<AddBookPage
					{...bookFieldProps}
					onNavigate={navigate}
					onSave={saveNewBook}
					onCancel={cancelAddBook}
				/>
			</Match>
			<Match when={page() === 'catalog'}>
				<CatalogPage lists={lists} actions={catalog} />
			</Match>
			<Match when={page() === 'locations'}>
				<LocationsPage list={lists.locations} actions={catalog} />
			</Match>
			<Match when={page() === 'users'}>
				<Show when={user().isAdmin} fallback={<p class="error">{t('users.adminOnly')}</p>}>
					<UsersPage list={users} currentUserId={user().id} manage={userManagement} />
				</Show>
			</Match>
		</Switch>
	)

	const dialogs = (user: Accessor<PublicUser>) => (
		<>
			<Show when={book.editingBook()} keyed>
				{(editing) => (
					<EditBookDialog
						{...bookFieldProps}
						editing={editing}
						isAdmin={user().isAdmin}
						users={users.items()}
					/>
				)}
			</Show>
			<Show when={userManagement.editingUser()} keyed>
				{(editing) => <EditUserDialog user={editing} manage={userManagement} />}
			</Show>
		</>
	)

	return (
		<Layout
			page={page()}
			user={auth.user()}
			showSearch={(page() === 'library' || page() === 'reading') && !!auth.user()}
			query={query()}
			onQueryChange={setQuery}
			onLogout={handleLogout}
			onNavigate={navigate}
		>
			<Switch>
				<Match when={auth.loading()}>
					<AuthLoading />
				</Match>
				<Match when={!auth.user()}>
					<AuthDialog
						mode={auth.setupRequired() ? 'setup' : 'login'}
						busy={auth.busy()}
						error={auth.error()}
						onSubmit={(credentials) =>
							void (auth.setupRequired() ? auth.setup(credentials) : auth.login(credentials))
						}
					/>
				</Match>
				<Match when={auth.user()}>
					{(user) => (
						<>
							{currentPage(user)}
							{dialogs(user)}
						</>
					)}
				</Match>
			</Switch>
		</Layout>
	)
}
