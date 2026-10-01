import '@serkonda7/solid-components/styles.css'
import { createEffect, createResource, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { api } from './api'
import { AuthLoading, LoginDialog, SetupDialog } from './components/AuthViews'
import { EditBookDialog } from './components/EditBookDialog'
import { Layout } from './components/Layout'
import { useAuth } from './hooks/useAuth'
import { useBookForm } from './hooks/useBookForm'
import { useCatalogActions } from './hooks/useCatalogActions'
import { useUserManagement } from './hooks/useUserManagement'
import { t } from './i18n'
import { AddBookPage } from './pages/AddBookPage'
import { CatalogPage } from './pages/CatalogPage'
import { LibraryPage } from './pages/LibraryPage'
import { LocationsPage } from './pages/LocationsPage'
import { EditUserDialog, UsersPage } from './pages/UsersPage'
import type { Author, Book, Language, Location, ManagedUser, Page, Publisher, Tag } from './types'
import { pageFromPath } from './utils/books'

export default function App() {
	const [page, setPage] = createSignal<Page>(pageFromPath(window.location.pathname))
	const [query, setQuery] = createSignal('')
	const [debouncedQuery, setDebouncedQuery] = createSignal('')

	const auth = useAuth()

	const [books, { refetch: refetchBooks }] = createResource(
		() => (auth.authUser() ? `${auth.authUser()?.id}:${debouncedQuery()}` : null),
		async (): Promise<Book[]> => {
			if (!auth.authUser()) return []
			const q = encodeURIComponent(debouncedQuery())
			const data = await api<{ books: Book[] }>(`/books?q=${q}`)
			return data.books
		},
	)

	const [authors, { refetch: refetchAuthors }] = createResource(
		() => auth.authUser()?.id ?? null,
		async (): Promise<Author[]> => {
			if (!auth.authUser()) return []
			const data = await api<{ authors: Author[] }>('/authors')
			return data.authors
		},
	)

	const [publishers, { refetch: refetchPublishers }] = createResource(
		() => auth.authUser()?.id ?? null,
		async (): Promise<Publisher[]> => {
			if (!auth.authUser()) return []
			const data = await api<{ publishers: Publisher[] }>('/publishers')
			return data.publishers
		},
	)

	const [locations, { refetch: refetchLocations }] = createResource(
		() => auth.authUser()?.id ?? null,
		async (): Promise<Location[]> => {
			if (!auth.authUser()) return []
			const data = await api<{ locations: Location[] }>('/locations')
			return data.locations
		},
	)

	const [tags, { refetch: refetchTags }] = createResource(
		() => auth.authUser()?.id ?? null,
		async (): Promise<Tag[]> => {
			if (!auth.authUser()) return []
			const data = await api<{ tags: Tag[] }>('/tags')
			return data.tags
		},
	)
	const [languages, { refetch: refetchLanguages }] = createResource(
		() => auth.authUser()?.id ?? null,
		async (): Promise<Language[]> => {
			if (!auth.authUser()) return []
			const data = await api<{ languages: Language[] }>('/languages')
			return data.languages
		},
	)

	const [managedUsers, { refetch: refetchUsers }] = createResource(
		() => (auth.authUser()?.isAdmin ? auth.authUser()?.id : null),
		async (): Promise<ManagedUser[]> => {
			if (!auth.authUser()?.isAdmin) return []
			const data = await api<{ users: ManagedUser[] }>('/users')
			return data.users
		},
	)

	const book = useBookForm({
		authUser: auth.authUser,
		refetchBooks: () => refetchBooks(),
		refetchLocations: () => refetchLocations(),
		getAuthors: () => authors(),
		getTags: () => tags(),
		getLanguages: () => languages(),
	})

	const catalog = useCatalogActions({
		refetchBooks: () => refetchBooks(),
		refetchAuthors: () => refetchAuthors(),
		refetchPublishers: () => refetchPublishers(),
		refetchLocations: () => refetchLocations(),
		refetchTags: () => refetchTags(),
		refetchLanguages: () => refetchLanguages(),
		setSelectedAuthorIds: book.setSelectedAuthorIds,
		getSelectedPublisherId: book.selectedPublisherId,
		setSelectedPublisherId: book.setSelectedPublisherId,
		getSelectedLocationId: book.selectedLocationId,
		setSelectedLocationId: book.setSelectedLocationId,
		setSelectedTagIds: book.setSelectedTagIds,
		setSelectedLanguageIds: book.setSelectedLanguageIds,
	})

	const users = useUserManagement({
		authUser: auth.authUser,
		setAuthUser: auth.setAuthUser,
		refetchUsers: () => refetchUsers(),
		refetchBooks: () => refetchBooks(),
	})

	async function handleLogin(e: Event): Promise<void> {
		const user = await auth.login(e)
		if (!user) return
		await Promise.all([
			refetchBooks(),
			refetchAuthors(),
			refetchPublishers(),
			refetchLocations(),
			refetchTags(),
			refetchLanguages(),
		])
		if (user.isAdmin) await refetchUsers()
	}

	async function handleSetup(e: Event): Promise<void> {
		const user = await auth.setup(e)
		if (!user) return
		await Promise.all([
			refetchBooks(),
			refetchAuthors(),
			refetchPublishers(),
			refetchLocations(),
			refetchTags(),
			refetchLanguages(),
		])
		await refetchUsers()
	}

	async function handleLogout(): Promise<void> {
		await auth.logout()
		setPage('library')
		window.history.pushState({}, '', '/library')
	}

	function navigateTo(path: string): void {
		window.history.pushState({}, '', path)
		setPage(pageFromPath(path))
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	async function handleAddBook(e: Event): Promise<void> {
		const ok = await book.addBook(e)
		if (ok) {
			catalog.resetInlineInputs()
			navigateTo('/library')
		}
	}

	async function handleAddBookAndCreateAnother(e: Event): Promise<void> {
		const ok = await book.addBook(e, true)
		if (ok) {
			catalog.resetInlineInputs()
			window.scrollTo({ top: 0, behavior: 'smooth' })
			document
				.querySelector<HTMLElement>('.form-panel input[placeholder^="e.g."]')
				?.focus({ preventScroll: true })
		}
	}

	function cancelAddBook(): void {
		book.resetForm()
		catalog.resetInlineInputs()
		navigateTo('/library')
	}

	async function handleSaveEditedBook(e: Event): Promise<void> {
		await book.saveEditedBook(e)
		if (!book.editingBook()) catalog.resetInlineInputs()
	}

	function cancelEditBook(): void {
		catalog.resetInlineInputs()
		book.closeEditBook()
	}

	function requestCancelEditBook(): void {
		book.requestCloseEditBook()
		if (!book.editingBook()) catalog.resetInlineInputs()
	}

	onMount(() => {
		const closeAuthorSelect = (event: MouseEvent) => {
			const target = event.target
			if (!(target instanceof Element) || target.closest('.multi-select')) return
			document.querySelectorAll<HTMLDetailsElement>('.multi-select[open]').forEach((details) => {
				details.open = false
			})
		}
		document.addEventListener('click', closeAuthorSelect)
		const closeEditOnEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape' && book.editingBook()) {
				catalog.resetInlineInputs()
				book.closeEditBook()
			}
			if (event.key === 'Escape' && users.editingUser()) users.closeEditUser()
		}
		document.addEventListener('keydown', closeEditOnEscape)
		onCleanup(() => {
			document.removeEventListener('click', closeAuthorSelect)
			document.removeEventListener('keydown', closeEditOnEscape)
		})
	})

	function navigate(path: string, event: MouseEvent): void {
		event.preventDefault()
		navigateTo(path)
	}

	createEffect(() => {
		const handlePopState = () => setPage(pageFromPath(window.location.pathname))
		window.addEventListener('popstate', handlePopState)
		onCleanup(() => window.removeEventListener('popstate', handlePopState))
	})

	createEffect(() => {
		const q = query()
		const t = setTimeout(() => setDebouncedQuery(q.trim()), 250)
		return () => clearTimeout(t)
	})

	return (
		<Layout
			page={page()}
			isAdmin={auth.authUser()?.isAdmin ?? false}
			showSearch={page() === 'library' && !!auth.authUser()}
			query={query()}
			onQueryChange={setQuery}
			onClearQuery={() => setQuery('')}
			user={auth.authUser()}
			onLogout={handleLogout}
			onNavigate={navigate}
		>
			<Show when={auth.authLoading()}>
				<AuthLoading />
			</Show>
			<Show when={!auth.authLoading() && auth.setupRequired()}>
				<SetupDialog
					username={auth.setupUsername()}
					onUsername={auth.setSetupUsername}
					displayName={auth.setupDisplayName()}
					onDisplayName={auth.setSetupDisplayName}
					password={auth.setupPassword()}
					onPassword={auth.setSetupPassword}
					busy={auth.setupBusy()}
					error={auth.authError()}
					onSubmit={handleSetup}
				/>
			</Show>
			<Show when={!auth.authLoading() && !auth.setupRequired() && !auth.authUser()}>
				<LoginDialog
					username={auth.loginUsername()}
					onUsername={auth.setLoginUsername}
					password={auth.loginPassword()}
					onPassword={auth.setLoginPassword}
					busy={auth.loginBusy()}
					error={auth.authError()}
					onSubmit={handleLogin}
				/>
			</Show>
			<Show when={!auth.authLoading() && auth.authUser()}>
				<Show when={page() === 'library'}>
					<LibraryPage
						debouncedQuery={debouncedQuery()}
						onNavigate={navigate}
						actionError={book.actionError()}
						booksLoading={books.loading}
						booksError={books.error}
						books={books() ?? []}
						deletingId={book.deletingId()}
						currentUserId={auth.authUser()?.id ?? null}
						isAdmin={auth.authUser()?.isAdmin ?? false}
						onDeleteBook={(id) => void book.removeBook(id)}
						onEditBook={book.editBook}
					/>
				</Show>

				<Show when={page() === 'add-book'}>
					<AddBookPage
						onNavigate={navigate}
						addPanelProps={{
							form: book.form(),
							onField: book.setField,
							authors: authors() ?? [],
							authorSummary: book.selectedAuthorLabel(),
							selectedAuthorIds: book.selectedAuthorIds(),
							onToggleAuthor: book.toggleAuthor,
							publishers: publishers() ?? [],
							selectedPublisherId: book.selectedPublisherId(),
							onSelectPublisher: book.setSelectedPublisherId,
							locations: locations() ?? [],
							selectedLocationId: book.selectedLocationId(),
							onSelectLocation: book.setSelectedLocationId,
							tags: tags() ?? [],
							tagSummary: book.selectedTagLabel(),
							selectedTagIds: book.selectedTagIds(),
							onToggleTag: book.toggleTag,
							newAuthorName: catalog.newAuthorName(),
							onNewAuthorName: catalog.setNewAuthorName,
							onAddAuthor: () => void catalog.addInlineAuthor(),
							newPublisherName: catalog.newPublisherName(),
							onNewPublisherName: catalog.setNewPublisherName,
							onAddPublisher: () => void catalog.addInlinePublisher(),
							newLocationName: catalog.newLocationName(),
							onNewLocationName: catalog.setNewLocationName,
							onAddLocation: () => void catalog.addInlineLocation(),
							newTagName: catalog.newTagName(),
							onNewTagName: catalog.setNewTagName,
							onAddTag: () => void catalog.addInlineTag(),
							languages: languages() ?? [],
							languageSummary: book.selectedLanguageLabel(),
							selectedLanguageIds: book.selectedLanguageIds(),
							onToggleLanguage: book.toggleLanguage,
							newLanguageName: catalog.newLanguageName(),
							onNewLanguageName: catalog.setNewLanguageName,
							onAddLanguage: () => void catalog.addInlineLanguage(),
							saving: book.saving(),
							formError: book.formError(),
							onSubmit: handleAddBook,
							onSubmitAnother: handleAddBookAndCreateAnother,
							onCancel: cancelAddBook,
						}}
					/>
				</Show>

				<Show when={book.editingBook()} keyed>
					{(editing) => (
						<EditBookDialog
							book={editing}
							form={book.form()}
							onField={book.setField}
							authors={authors() ?? []}
							authorSummary={book.selectedAuthorLabel()}
							selectedAuthorIds={book.selectedAuthorIds()}
							onToggleAuthor={book.toggleAuthor}
							publishers={publishers() ?? []}
							selectedPublisherId={book.selectedPublisherId()}
							onSelectPublisher={book.setSelectedPublisherId}
							locations={locations() ?? []}
							selectedLocationId={book.selectedLocationId()}
							onSelectLocation={book.setSelectedLocationId}
							tags={tags() ?? []}
							tagSummary={book.selectedTagLabel()}
							selectedTagIds={book.selectedTagIds()}
							onToggleTag={book.toggleTag}
							newAuthorName={catalog.newAuthorName()}
							onNewAuthorName={catalog.setNewAuthorName}
							onAddAuthor={() => void catalog.addInlineAuthor()}
							newPublisherName={catalog.newPublisherName()}
							onNewPublisherName={catalog.setNewPublisherName}
							onAddPublisher={() => void catalog.addInlinePublisher()}
							newLocationName={catalog.newLocationName()}
							onNewLocationName={catalog.setNewLocationName}
							onAddLocation={() => void catalog.addInlineLocation()}
							newTagName={catalog.newTagName()}
							onNewTagName={catalog.setNewTagName}
							onAddTag={() => void catalog.addInlineTag()}
							languages={languages() ?? []}
							languageSummary={book.selectedLanguageLabel()}
							selectedLanguageIds={book.selectedLanguageIds()}
							onToggleLanguage={book.toggleLanguage}
							newLanguageName={catalog.newLanguageName()}
							onNewLanguageName={catalog.setNewLanguageName}
							onAddLanguage={() => void catalog.addInlineLanguage()}
							isAdmin={auth.authUser()?.isAdmin ?? false}
							users={managedUsers() ?? []}
							selectedOwnerId={book.selectedOwnerId()}
							onSelectOwner={book.setSelectedOwnerId}
							saving={book.editSaving()}
							error={book.editError()}
							onSubmit={handleSaveEditedBook}
							onClose={cancelEditBook}
							onBackdropClose={requestCancelEditBook}
							onRemoveProvenance={(bookId, eventId) =>
								void book.removeProvenanceEvent(bookId, eventId)
							}
						/>
					)}
				</Show>

				<Show when={page() === 'catalog'}>
					<CatalogPage
						catalogError={catalog.catalogError()}
						authors={authors() ?? []}
						authorsLoading={authors.loading}
						manageAuthorName={catalog.manageAuthorName()}
						onManageAuthorName={catalog.setManageAuthorName}
						onAddAuthor={() => void catalog.addManageAuthor()}
						onRenameAuthor={(id, current) => void catalog.renameAuthor(id, current)}
						onRemoveAuthor={(id, name) => void catalog.removeAuthor(id, name)}
						publishers={publishers() ?? []}
						publishersLoading={publishers.loading}
						managePublisherName={catalog.managePublisherName()}
						onManagePublisherName={catalog.setManagePublisherName}
						onAddPublisher={() => void catalog.addManagePublisher()}
						onRenamePublisher={(id, current) => void catalog.renamePublisher(id, current)}
						onRemovePublisher={(id, name) => void catalog.removePublisher(id, name)}
						tags={tags() ?? []}
						tagsLoading={tags.loading}
						manageTagName={catalog.manageTagName()}
						onManageTagName={catalog.setManageTagName}
						onAddTag={() => void catalog.addManageTag()}
						onRenameTag={(id, current) => void catalog.renameTag(id, current)}
						onRemoveTag={(id, name) => void catalog.removeTag(id, name)}
						languages={languages() ?? []}
						languagesLoading={languages.loading}
						manageLanguageName={catalog.manageLanguageName()}
						onManageLanguageName={catalog.setManageLanguageName}
						onAddLanguage={() => void catalog.addManageLanguage()}
						onRenameLanguage={(id, current) => void catalog.renameLanguage(id, current)}
						onRemoveLanguage={(id, name) => void catalog.removeLanguage(id, name)}
					/>
				</Show>
				<Show when={page() === 'locations'}>
					<LocationsPage
						locations={locations() ?? []}
						locationsLoading={locations.loading}
						catalogError={catalog.catalogError()}
						manageName={catalog.manageLocationName()}
						onManageName={catalog.setManageLocationName}
						manageParentId={catalog.manageLocationParentId()}
						onManageParentId={catalog.setManageLocationParentId}
						onAdd={() => void catalog.addManageLocation()}
						onRename={(id, current) => void catalog.renameLocation(id, current)}
						onMove={(id, parentId) => void catalog.moveLocation(id, parentId)}
						onRemove={(id, name) => void catalog.removeLocation(id, name)}
					/>
				</Show>
				<Show when={page() === 'users'}>
					<Show
						when={auth.authUser()?.isAdmin}
						fallback={<p class="error">{t('users.adminOnly')}</p>}
					>
						<UsersPage
							users={managedUsers() ?? []}
							usersLoading={managedUsers.loading}
							currentUserId={auth.authUser()?.id ?? null}
							userError={users.userError()}
							newUsername={users.newUsername()}
							onNewUsername={users.setNewUsername}
							newDisplayName={users.newDisplayName()}
							onNewDisplayName={users.setNewDisplayName}
							newPassword={users.newPassword()}
							onNewPassword={users.setNewPassword}
							newIsAdmin={users.newIsAdmin()}
							onNewIsAdmin={users.setNewIsAdmin}
							userSaving={users.userSaving()}
							onCreateUser={(e) => void users.createUser(e)}
							onRemoveUser={(id, username) => void users.removeUser(id, username)}
							onStartEditUser={users.startEditUser}
						/>
					</Show>
				</Show>
				<Show when={users.editingUser()} keyed>
					{(editing) => (
						<EditUserDialog
							user={editing}
							username={users.editUsername()}
							onUsername={users.setEditUsername}
							displayName={users.editDisplayName()}
							onDisplayName={users.setEditDisplayName}
							password={users.editPassword()}
							onPassword={users.setEditPassword}
							isAdmin={users.editIsAdmin()}
							onIsAdmin={users.setEditIsAdmin}
							saving={users.editUserSaving()}
							error={users.editUserError()}
							onSubmit={(e) => void users.saveEditUser(e)}
							onClose={users.closeEditUser}
							onBackdropClose={users.requestCloseEditUser}
						/>
					)}
				</Show>
			</Show>
		</Layout>
	)
}
