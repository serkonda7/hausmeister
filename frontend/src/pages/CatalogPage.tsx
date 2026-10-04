import { IconPlus } from '@tabler/icons-solidjs'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { ClearableInput } from '../components/ClearableInput'
import { ErrorText } from '../components/common'
import { EntryLinks, type LinkedKind } from '../components/EntryLinks'
import { EntryTable } from '../components/EntryTable'
import type { CatalogActions, CatalogLists, NamedKind } from '../hooks/useCatalog'
import { t } from '../i18n'

const SECTIONS: NamedKind[] = ['authors', 'publishers', 'tags', 'languages']

/** Kinds whose entries have their own page. */
const LINKED: Partial<Record<NamedKind, LinkedKind>> = {
	authors: 'author',
	publishers: 'publisher',
}

export type CatalogPageProps = {
	lists: CatalogLists
	actions: CatalogActions
	onNavigate: (path: string, event: MouseEvent) => void
}

export function CatalogPage(props: CatalogPageProps) {
	return (
		<>
			<section class="library-head">
				<div>
					<h2>{t('nav.catalog')}</h2>
					<p class="muted">{t('catalog.intro')}</p>
				</div>
			</section>
			<ErrorText message={props.actions.error()} />
			<div class="catalog-grid">
				<For each={SECTIONS}>{(kind) => <CatalogSection {...props} kind={kind} />}</For>
			</div>
		</>
	)
}

/** One catalog list with a combined search / add input. */
function CatalogSection(props: CatalogPageProps & { kind: NamedKind }) {
	const list = () => props.lists[props.kind]
	const [search, setSearch] = createSignal('')
	const query = () => search().trim().toLocaleLowerCase()
	const matching = createMemo(() =>
		list()
			.items()
			.filter((item) => item.name.toLocaleLowerCase().includes(query())),
	)
	const canAdd = () =>
		query() !== '' &&
		!list()
			.items()
			.some((item) => item.name.toLocaleLowerCase() === query())
	const title = () => t(`catalog.${props.kind}`)
	const searchLabel = () => t(`catalog.${props.kind}Search`)

	async function add(): Promise<void> {
		if (await props.actions.create(props.kind, search())) setSearch('')
	}

	return (
		<section class="panel catalog-section">
			<div class="catalog-section-header">
				<h3>{title()}</h3>
				<span class="catalog-count">{list().items().length}</span>
			</div>
			<div class="inline-create">
				<ClearableInput
					placeholder={`${searchLabel()}…`}
					value={search()}
					onInput={(e) => setSearch(e.currentTarget.value)}
					onKeyDown={(e) => {
						if (e.key !== 'Enter' || !canAdd()) return
						e.preventDefault()
						void add()
					}}
					aria-label={searchLabel()}
				/>
				<button type="button" class="primary" onClick={() => void add()} disabled={!canAdd()}>
					<IconPlus size={15} /> {t('common.add')}
				</button>
			</div>
			<Show
				when={!list().loading() && matching().length > 0}
				fallback={
					<p class="muted small">
						{query() ? t(`catalog.${props.kind}NoMatch`) : t(`catalog.${props.kind}Empty`)}
					</p>
				}
			>
				<EntryTable
					label={t('catalog.listLabel', { label: title() })}
					items={matching()}
					onRename={(id, current) => void props.actions.rename(props.kind, id, current)}
					onRemove={(id, name) => void props.actions.remove(props.kind, id, name)}
					renderName={(item) => {
						const kind = LINKED[props.kind]
						return kind ? (
							<EntryLinks kind={kind} entries={[item]} onNavigate={props.onNavigate} />
						) : (
							item.name
						)
					}}
				/>
			</Show>
		</section>
	)
}
