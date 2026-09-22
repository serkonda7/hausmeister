import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-solidjs'
import { createMemo, For, Show } from 'solid-js'
import type { Author, Language, Publisher, Tag } from '../types'

export type CatalogPageProps = {
	catalogError: string | null
	authors: Author[]
	authorsLoading: boolean
	manageAuthorName: string
	onManageAuthorName: (v: string) => void
	onAddAuthor: () => void
	onRenameAuthor: (id: string, current: string) => void
	onRemoveAuthor: (id: string, name: string) => void
	publishers: Publisher[]
	publishersLoading: boolean
	managePublisherName: string
	onManagePublisherName: (v: string) => void
	onAddPublisher: () => void
	onRenamePublisher: (id: string, current: string) => void
	onRemovePublisher: (id: string, name: string) => void
	tags: Tag[]
	tagsLoading: boolean
	manageTagName: string
	onManageTagName: (v: string) => void
	onAddTag: () => void
	onRenameTag: (id: string, current: string) => void
	onRemoveTag: (id: string, name: string) => void
	languages: Language[]
	languagesLoading: boolean
	manageLanguageName: string
	onManageLanguageName: (v: string) => void
	onAddLanguage: () => void
	onRenameLanguage: (id: string, current: string) => void
	onRemoveLanguage: (id: string, name: string) => void
}

export function CatalogPage(props: CatalogPageProps) {
	const matchingAuthors = createMemo(() => filterItems(props.authors, props.manageAuthorName))
	const matchingLanguages = createMemo(() => filterItems(props.languages, props.manageLanguageName))
	const matchingPublishers = createMemo(() =>
		filterItems(props.publishers, props.managePublisherName),
	)
	const matchingTags = createMemo(() => filterItems(props.tags, props.manageTagName))
	const canAddAuthor = createMemo(() => canCreateItem(props.manageAuthorName, props.authors))
	const canAddLanguage = createMemo(() => canCreateItem(props.manageLanguageName, props.languages))
	const canAddPublisher = createMemo(() =>
		canCreateItem(props.managePublisherName, props.publishers),
	)
	const canAddTag = createMemo(() => canCreateItem(props.manageTagName, props.tags))

	return (
		<>
			<section class="library-head">
				<div>
					<h2>Data catalog</h2>
					<p class="muted">
						Manage the authors, languages, publishers, and tags used in your library.
					</p>
				</div>
			</section>
			<Show when={props.catalogError}>
				<p class="error">{props.catalogError}</p>
			</Show>
			<div class="catalog-grid">
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>Authors</h3>
						<span class="catalog-count">{props.authors.length}</span>
					</div>
					<div class="inline-create">
						<input
							placeholder="Search or add an author…"
							value={props.manageAuthorName}
							onInput={(e) => props.onManageAuthorName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddAuthor()) {
									e.preventDefault()
									props.onAddAuthor()
								}
							}}
							aria-label="Search or add an author"
						/>
						<button
							type="button"
							class="primary"
							onClick={props.onAddAuthor}
							disabled={!canAddAuthor()}
						>
							<IconPlus size={15} /> Add
						</button>
					</div>
					<Show
						when={!props.authorsLoading && matchingAuthors().length > 0}
						fallback={
							<p class="muted small">
								{props.manageAuthorName.trim() ? 'No matching authors.' : 'No authors yet.'}
							</p>
						}
					>
						<CatalogTable
							label="Authors"
							items={matchingAuthors()}
							onRename={props.onRenameAuthor}
							onRemove={props.onRemoveAuthor}
						/>
					</Show>
				</section>
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>Languages</h3>
						<span class="catalog-count">{props.languages.length}</span>
					</div>
					<div class="inline-create">
						<input
							placeholder="Search or add a language…"
							value={props.manageLanguageName}
							onInput={(e) => props.onManageLanguageName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddLanguage()) {
									e.preventDefault()
									props.onAddLanguage()
								}
							}}
							aria-label="Search or add a language"
						/>
						<button
							type="button"
							class="primary"
							onClick={props.onAddLanguage}
							disabled={!canAddLanguage()}
						>
							<IconPlus size={15} /> Add
						</button>
					</div>
					<Show
						when={!props.languagesLoading && matchingLanguages().length > 0}
						fallback={
							<p class="muted small">
								{props.manageLanguageName.trim() ? 'No matching languages.' : 'No languages yet.'}
							</p>
						}
					>
						<CatalogTable
							label="Languages"
							items={matchingLanguages()}
							onRename={props.onRenameLanguage}
							onRemove={props.onRemoveLanguage}
						/>
					</Show>
				</section>
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>Publishers</h3>
						<span class="catalog-count">{props.publishers.length}</span>
					</div>
					<div class="inline-create">
						<input
							placeholder="Search or add a publisher…"
							value={props.managePublisherName}
							onInput={(e) => props.onManagePublisherName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddPublisher()) {
									e.preventDefault()
									props.onAddPublisher()
								}
							}}
							aria-label="Search or add a publisher"
						/>
						<button
							type="button"
							class="primary"
							onClick={props.onAddPublisher}
							disabled={!canAddPublisher()}
						>
							<IconPlus size={15} /> Add
						</button>
					</div>
					<Show
						when={!props.publishersLoading && matchingPublishers().length > 0}
						fallback={
							<p class="muted small">
								{props.managePublisherName.trim()
									? 'No matching publishers.'
									: 'No publishers yet.'}
							</p>
						}
					>
						<CatalogTable
							label="Publishers"
							items={matchingPublishers()}
							onRename={props.onRenamePublisher}
							onRemove={props.onRemovePublisher}
						/>
					</Show>
				</section>
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>Tags</h3>
						<span class="catalog-count">{props.tags.length}</span>
					</div>
					<div class="inline-create">
						<input
							placeholder="Search or add a tag…"
							value={props.manageTagName}
							onInput={(e) => props.onManageTagName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddTag()) {
									e.preventDefault()
									props.onAddTag()
								}
							}}
							aria-label="Search or add a tag"
						/>
						<button type="button" class="primary" onClick={props.onAddTag} disabled={!canAddTag()}>
							<IconPlus size={15} /> Add
						</button>
					</div>
					<Show
						when={!props.tagsLoading && matchingTags().length > 0}
						fallback={
							<p class="muted small">
								{props.manageTagName.trim() ? 'No matching tags.' : 'No tags yet.'}
							</p>
						}
					>
						<CatalogTable
							label="Tags"
							items={matchingTags()}
							onRename={props.onRenameTag}
							onRemove={props.onRemoveTag}
						/>
					</Show>
				</section>
			</div>
		</>
	)
}

type CatalogEntry = { id: string; name: string; bookCount?: number }

type CatalogTableProps = {
	label: string
	items: CatalogEntry[]
	onRename: (id: string, current: string) => void
	onRemove: (id: string, name: string) => void
}

function CatalogTable(props: CatalogTableProps) {
	return (
		<div class="catalog-table-wrap">
			<table class="catalog-table" aria-label={`${props.label} list`}>
				<thead>
					<tr>
						<th scope="col">Name</th>
						<th scope="col">Books</th>
						<th scope="col">
							<span class="sr-only">Actions</span>
						</th>
					</tr>
				</thead>
				<tbody>
					<For each={props.items}>
						{(item) => (
							<tr>
								<td class="catalog-table-name" title={item.name}>
									{item.name}
								</td>
								<td class="catalog-table-books">{item.bookCount ?? 0}</td>
								<td>
									<span class="manage-actions">
										<button
											type="button"
											class="ghost small-btn catalog-rename-btn"
											onClick={() => props.onRename(item.id, item.name)}
											aria-label={`Rename ${item.name}`}
											title={`Rename ${item.name}`}
										>
											<IconEdit size={14} />
										</button>
										<button
											type="button"
											class="danger-ghost"
											onClick={() => props.onRemove(item.id, item.name)}
											aria-label={`Delete ${item.name}`}
										>
											<IconTrash size={14} />
										</button>
									</span>
								</td>
							</tr>
						)}
					</For>
				</tbody>
			</table>
		</div>
	)
}

function filterItems<T extends { name: string }>(items: T[], search: string): T[] {
	const query = search.trim().toLocaleLowerCase()
	return query ? items.filter((item) => item.name.toLocaleLowerCase().includes(query)) : items
}

function canCreateItem(search: string, items: Array<{ name: string }>): boolean {
	const query = search.trim().toLocaleLowerCase()
	return query !== '' && !items.some((item) => item.name.toLocaleLowerCase() === query)
}
