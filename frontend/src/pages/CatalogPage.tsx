import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-solidjs'
import { createMemo, For, Show } from 'solid-js'
import { ClearableInput } from '../components/ClearableInput'
import { t } from '../i18n'
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
					<h2>{t('nav.catalog')}</h2>
					<p class="muted">{t('catalog.intro')}</p>
				</div>
			</section>
			<Show when={props.catalogError}>
				<p class="error">{props.catalogError}</p>
			</Show>
			<div class="catalog-grid">
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>{t('catalog.authors')}</h3>
						<span class="catalog-count">{props.authors.length}</span>
					</div>
					<div class="inline-create">
						<ClearableInput
							placeholder={`${t('catalog.authorsSearch')}…`}
							value={props.manageAuthorName}
							onInput={(e) => props.onManageAuthorName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddAuthor()) {
									e.preventDefault()
									props.onAddAuthor()
								}
							}}
							aria-label={t('catalog.authorsSearch')}
						/>
						<button
							type="button"
							class="primary"
							onClick={props.onAddAuthor}
							disabled={!canAddAuthor()}
						>
							<IconPlus size={15} /> {t('common.add')}
						</button>
					</div>
					<Show
						when={!props.authorsLoading && matchingAuthors().length > 0}
						fallback={
							<p class="muted small">
								{props.manageAuthorName.trim()
									? t('catalog.authorsNoMatch')
									: t('catalog.authorsEmpty')}
							</p>
						}
					>
						<CatalogTable
							label={t('catalog.authors')}
							items={matchingAuthors()}
							onRename={props.onRenameAuthor}
							onRemove={props.onRemoveAuthor}
						/>
					</Show>
				</section>
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>{t('catalog.publishers')}</h3>
						<span class="catalog-count">{props.publishers.length}</span>
					</div>
					<div class="inline-create">
						<ClearableInput
							placeholder={`${t('catalog.publishersSearch')}…`}
							value={props.managePublisherName}
							onInput={(e) => props.onManagePublisherName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddPublisher()) {
									e.preventDefault()
									props.onAddPublisher()
								}
							}}
							aria-label={t('catalog.publishersSearch')}
						/>
						<button
							type="button"
							class="primary"
							onClick={props.onAddPublisher}
							disabled={!canAddPublisher()}
						>
							<IconPlus size={15} /> {t('common.add')}
						</button>
					</div>
					<Show
						when={!props.publishersLoading && matchingPublishers().length > 0}
						fallback={
							<p class="muted small">
								{props.managePublisherName.trim()
									? t('catalog.publishersNoMatch')
									: t('catalog.publishersEmpty')}
							</p>
						}
					>
						<CatalogTable
							label={t('catalog.publishers')}
							items={matchingPublishers()}
							onRename={props.onRenamePublisher}
							onRemove={props.onRemovePublisher}
						/>
					</Show>
				</section>
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>{t('catalog.tags')}</h3>
						<span class="catalog-count">{props.tags.length}</span>
					</div>
					<div class="inline-create">
						<ClearableInput
							placeholder={`${t('catalog.tagsSearch')}…`}
							value={props.manageTagName}
							onInput={(e) => props.onManageTagName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddTag()) {
									e.preventDefault()
									props.onAddTag()
								}
							}}
							aria-label={t('catalog.tagsSearch')}
						/>
						<button type="button" class="primary" onClick={props.onAddTag} disabled={!canAddTag()}>
							<IconPlus size={15} /> {t('common.add')}
						</button>
					</div>
					<Show
						when={!props.tagsLoading && matchingTags().length > 0}
						fallback={
							<p class="muted small">
								{props.manageTagName.trim() ? t('catalog.tagsNoMatch') : t('catalog.tagsEmpty')}
							</p>
						}
					>
						<CatalogTable
							label={t('catalog.tags')}
							items={matchingTags()}
							onRename={props.onRenameTag}
							onRemove={props.onRemoveTag}
						/>
					</Show>
				</section>
				<section class="panel catalog-section">
					<div class="catalog-section-header">
						<h3>{t('catalog.languages')}</h3>
						<span class="catalog-count">{props.languages.length}</span>
					</div>
					<div class="inline-create">
						<ClearableInput
							placeholder={`${t('catalog.languagesSearch')}…`}
							value={props.manageLanguageName}
							onInput={(e) => props.onManageLanguageName(e.currentTarget.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && canAddLanguage()) {
									e.preventDefault()
									props.onAddLanguage()
								}
							}}
							aria-label={t('catalog.languagesSearch')}
						/>
						<button
							type="button"
							class="primary"
							onClick={props.onAddLanguage}
							disabled={!canAddLanguage()}
						>
							<IconPlus size={15} /> {t('common.add')}
						</button>
					</div>
					<Show
						when={!props.languagesLoading && matchingLanguages().length > 0}
						fallback={
							<p class="muted small">
								{props.manageLanguageName.trim()
									? t('catalog.languagesNoMatch')
									: t('catalog.languagesEmpty')}
							</p>
						}
					>
						<CatalogTable
							label={t('catalog.languages')}
							items={matchingLanguages()}
							onRename={props.onRenameLanguage}
							onRemove={props.onRemoveLanguage}
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
			<table class="catalog-table" aria-label={t('catalog.listLabel', { label: props.label })}>
				<thead>
					<tr>
						<th scope="col">{t('common.name')}</th>
						<th scope="col">{t('common.books')}</th>
						<th scope="col">
							<span class="sr-only">{t('common.actions')}</span>
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
											aria-label={t('common.rename', { name: item.name })}
											title={t('common.rename', { name: item.name })}
										>
											<IconEdit size={14} />
										</button>
										<button
											type="button"
											class="danger-ghost"
											onClick={() => props.onRemove(item.id, item.name)}
											aria-label={t('common.delete', { name: item.name })}
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
