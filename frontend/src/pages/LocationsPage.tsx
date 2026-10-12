import { IconChevronRight, IconPlus } from '@tabler/icons-solidjs'
import { canEditLocation } from 'shared/src/book'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { ClearableInput } from '../components/ClearableInput'
import { ErrorText, TextField } from '../components/common'
import { EntryTable } from '../components/EntryTable'
import type { CatalogActions, List } from '../hooks/useCatalog'
import { t } from '../i18n'
import type { Location, PublicUser } from '../types'
import {
	isOwnLocation,
	locationLabel,
	locationSubtreeIds,
	sortLocations,
	userDisplayName,
} from '../utils/books'

export type LocationsPageProps = {
	list: List<Location>
	actions: CatalogActions
	/** Renaming, moving and deleting a location is up to its owner or an admin. */
	user: PublicUser
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

	const byId = createMemo(() => new Map(locations().map((l) => [l.id, l])))
	const childCounts = createMemo(() => {
		const counts = new Map<string, number>()
		for (const l of locations()) {
			if (l.parentId) counts.set(l.parentId, (counts.get(l.parentId) ?? 0) + 1)
		}
		return counts
	})
	const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())
	const isHidden = (l: Location) => {
		for (let p = l.parentId; p; p = byId().get(p)?.parentId ?? null) {
			if (collapsed().has(p)) return true
		}
		return false
	}
	// Filtered results ignore collapsing so every match is visible.
	const visible = createMemo(() => (query() ? matching() : locations().filter((l) => !isHidden(l))))
	const anyCollapsed = () => collapsed().size > 0
	function toggle(id: string): void {
		const next = new Set(collapsed())
		if (!next.delete(id)) next.add(id)
		setCollapsed(next)
	}
	function toggleAll(): void {
		setCollapsed(anyCollapsed() ? new Set<string>() : new Set(childCounts().keys()))
	}

	const canManage = (l: Location) => canEditLocation(l, props.user)
	const isOwn = (l: Location) => isOwnLocation(l, props.user.id)
	const ownLocations = createMemo(() => locations().filter(isOwn))

	const [newName, setNewName] = createSignal('')
	const [newParentId, setNewParentId] = createSignal('')
	// The chosen parent may have been deleted in the meantime.
	const parentId = () => (ownLocations().some((l) => l.id === newParentId()) ? newParentId() : '')

	async function add(): Promise<void> {
		if (await props.actions.create('locations', newName(), parentId())) setNewName('')
	}

	function addChild(l: Location): void {
		setNewParentId(l.id)
		const input = document.getElementById('new-location-name')
		input?.scrollIntoView({ behavior: 'smooth', block: 'center' })
		input?.focus({ preventScroll: true })
	}

	// Indent by depth, except in filtered results.
	const indent = (l: Location) =>
		query() ? undefined : `padding-left: ${0.45 + Math.min(l.depth ?? 0, 6) * 1.25}rem`

	const toggleButton = (l: Location) => {
		const open = () => !collapsed().has(l.id)
		return (
			<button
				type="button"
				class="location-toggle"
				classList={{ open: open() }}
				onClick={() => toggle(l.id)}
				aria-expanded={open()}
				aria-label={t(open() ? 'locations.collapse' : 'locations.expand', { name: l.name })}
			>
				<IconChevronRight size={14} />
			</button>
		)
	}

	// Tree view shows structure via indentation; filtered results need the path for context.
	const nameCell = (l: Location) => (
		<span class="location-name">
			<Show when={!query()}>
				<Show when={childCounts().has(l.id)} fallback={<span class="location-toggle-spacer" />}>
					{toggleButton(l)}
				</Show>
			</Show>
			<span class="location-name-text">
				<strong>{l.name}</strong>
				<Show when={query() && l.fullPath && l.fullPath !== l.name}>
					<span class="location-full-path">{l.fullPath}</span>
				</Show>
				<Show when={!isOwn(l) && l.owner}>
					{(owner) => (
						<span class="location-full-path">
							{t('locations.ownedBy', { name: userDisplayName(owner()) })}
						</span>
					)}
				</Show>
			</span>
			<Show when={!query() && collapsed().has(l.id)}>
				<span class="location-child-count">+{childCounts().get(l.id)}</span>
			</Show>
		</span>
	)

	const addChildButton = (l: Location) => (
		<Show when={isOwn(l)}>
			<button
				type="button"
				class="ghost small-btn catalog-rename-btn"
				onClick={() => addChild(l)}
				aria-label={t('locations.addChild', { name: l.name })}
				title={t('locations.addChild', { name: l.name })}
			>
				<IconPlus size={14} />
			</button>
		</Show>
	)

	const parentSelect = (l: Location) => {
		if (!canManage(l)) {
			const parent = l.parentId ? byId().get(l.parentId) : undefined
			return parent ? (
				<span class="location-parent">{locationLabel(parent)}</span>
			) : (
				<span class="muted">{t('locations.topLevel')}</span>
			)
		}
		const subtree = locationSubtreeIds(locations(), l.id)
		return (
			<select
				class="location-parent-select"
				classList={{ 'top-level': !l.parentId }}
				value={l.parentId ?? ''}
				onChange={(e) => void props.actions.moveLocation(l.id, e.currentTarget.value)}
				aria-label={t('locations.moveAria', { name: l.name })}
				title={t('locations.moveTitle')}
			>
				<option value="">{t('locations.topLevel')}</option>
				<LocationOptions
					locations={locations().filter((o) => o.ownerId === l.ownerId && !subtree.has(o.id))}
				/>
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
							<LocationOptions locations={ownLocations()} />
						</select>
					</label>
				</div>
				<div class="form-actions">
					<button type="button" class="primary" onClick={() => void add()}>
						<IconPlus size={15} /> {t('locations.add')}
					</button>
				</div>
			</section>
			<section class="panel catalog-section location-list-section">
				<div class="catalog-section-header">
					<h3>{t('locations.all')}</h3>
					<div class="location-list-tools">
						<Show when={!query() && childCounts().size > 0}>
							<button type="button" class="ghost small-btn" onClick={toggleAll}>
								{anyCollapsed() ? t('locations.expandAll') : t('locations.collapseAll')}
							</button>
						</Show>
						<span class="catalog-count">{locations().length}</span>
					</div>
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
						items={visible()}
						onRename={(id, current) => void props.actions.rename('locations', id, current)}
						onRemove={(id, name) => void props.actions.remove('locations', id, name)}
						canManage={canManage}
						nameTitle={locationLabel}
						nameStyle={indent}
						renderName={nameCell}
						extraColumn={{ label: t('locations.parent'), render: parentSelect }}
						rowActions={addChildButton}
					/>
				</Show>
			</section>
		</>
	)
}
