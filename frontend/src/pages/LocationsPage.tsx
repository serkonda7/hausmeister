import { IconPlus } from '@tabler/icons-solidjs'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { ClearableInput } from '../components/ClearableInput'
import { ErrorText, TextField } from '../components/common'
import { EntryTable } from '../components/EntryTable'
import type { CatalogActions, List } from '../hooks/useCatalog'
import { t } from '../i18n'
import type { Location } from '../types'
import { locationLabel, locationSubtreeIds, sortLocations } from '../utils/books'

export type LocationsPageProps = {
	list: List<Location>
	actions: CatalogActions
}

function LocationOptions(props: { locations: Location[] }) {
	return <For each={props.locations}>{(l) => <option value={l.id}>{locationLabel(l)}</option>}</For>
}

export function LocationsPage(props: LocationsPageProps) {
	const locations = createMemo(() => sortLocations(props.list.items()))
	const [search, setSearch] = createSignal('')
	const query = () => search().trim().toLocaleLowerCase()
	const matching = createMemo(() =>
		locations().filter((l) => locationLabel(l).toLocaleLowerCase().includes(query())),
	)

	const [newName, setNewName] = createSignal('')
	const [newParentId, setNewParentId] = createSignal('')
	// The chosen parent may have been deleted in the meantime.
	const parentId = () => (locations().some((l) => l.id === newParentId()) ? newParentId() : '')

	async function add(): Promise<void> {
		if (await props.actions.create('locations', newName(), parentId())) setNewName('')
	}

	// Indent by depth, except in filtered results.
	const indent = (l: Location) =>
		query() ? undefined : `padding-left: ${0.45 + Math.min(l.depth ?? 0, 6) * 1.25}rem`

	const nameWithPath = (l: Location) => (
		<>
			<strong>{l.name}</strong>
			<Show when={l.fullPath && l.fullPath !== l.name}>
				<span class="location-full-path">{l.fullPath}</span>
			</Show>
		</>
	)

	const parentSelect = (l: Location) => {
		const subtree = locationSubtreeIds(locations(), l.id)
		return (
			<select
				value={l.parentId ?? ''}
				onChange={(e) => void props.actions.moveLocation(l.id, e.currentTarget.value)}
				aria-label={t('locations.moveAria', { name: l.name })}
				title={t('locations.moveTitle')}
			>
				<option value="">{t('locations.topLevel')}</option>
				<LocationOptions locations={locations().filter((o) => !subtree.has(o.id))} />
			</select>
		)
	}

	return (
		<>
			<section class="library-head">
				<div>
					<h2>
						{t('nav.locations')} ({locations().length})
					</h2>
				</div>
			</section>
			<ErrorText message={props.actions.error()} />
			<section class="panel catalog-section">
				<h3>{t('locations.new')}</h3>
				<div class="form-grid location-create-grid">
					<TextField
						id="new-location-name"
						label={t('common.name')}
						required
						placeholder={t('locations.namePlaceholder')}
						value={newName()}
						onInput={setNewName}
						aria-label={t('locations.nameAria')}
					/>
					<label>
						<span>{t('locations.parentOptional')}</span>
						<select
							value={parentId()}
							onChange={(e) => setNewParentId(e.currentTarget.value)}
							aria-label={t('locations.parentAria')}
						>
							<option value="">{t('locations.topLevelOption')}</option>
							<LocationOptions locations={locations()} />
						</select>
					</label>
				</div>
				<div class="form-actions">
					<button type="button" class="primary" onClick={() => void add()}>
						<IconPlus size={15} /> {t('locations.add')}
					</button>
				</div>
			</section>
			<section class="panel catalog-section">
				<div class="catalog-section-header">
					<h3>{t('locations.all')}</h3>
					<span class="catalog-count">{locations().length}</span>
				</div>
				<div class="inline-create">
					<ClearableInput
						placeholder={`${t('locations.filter')}…`}
						value={search()}
						onInput={(e) => setSearch(e.currentTarget.value)}
						aria-label={t('locations.filter')}
					/>
				</div>
				<Show
					when={!props.list.loading() && matching().length > 0}
					fallback={
						<p class="muted small">{query() ? t('locations.noMatch') : t('locations.empty')}</p>
					}
				>
					<EntryTable
						label={t('locations.listLabel')}
						class="catalog-table location-table"
						items={matching()}
						onRename={(id, current) => void props.actions.rename('locations', id, current)}
						onRemove={(id, name) => void props.actions.remove('locations', id, name)}
						nameTitle={locationLabel}
						nameStyle={indent}
						renderName={nameWithPath}
						extraColumn={{ label: t('locations.parent'), render: parentSelect }}
					/>
				</Show>
			</section>
		</>
	)
}
