import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-solidjs'
import { createMemo, createSignal, For, Show } from 'solid-js'
import { ClearableInput } from '../components/ClearableInput'
import type { Location } from '../types'
import { locationDescendantIds, locationOptions } from '../utils/books'

export type LocationsPageProps = {
	locations: Location[]
	locationsLoading: boolean
	catalogError: string | null
	manageName: string
	onManageName: (v: string) => void
	manageParentId: string
	onManageParentId: (v: string) => void
	onAdd: () => void
	onRename: (id: string, current: string) => void
	onMove: (id: string, parentId: string) => void
	onRemove: (id: string, name: string) => void
}

export function LocationsPage(props: LocationsPageProps) {
	const [search, setSearch] = createSignal('')
	const matchingLocations = createMemo(() => {
		const query = search().trim().toLocaleLowerCase()
		const options = locationOptions(props.locations)
		return query
			? options.filter((location) =>
					(location.fullPath ?? location.name).toLocaleLowerCase().includes(query),
				)
			: options
	})

	return (
		<>
			<section class="library-head">
				<div>
					<h2>Locations ({props.locations.length})</h2>
				</div>
			</section>
			<Show when={props.catalogError}>
				<p class="error">{props.catalogError}</p>
			</Show>
			<section class="panel catalog-section">
				<h3>New location</h3>
				<div class="form-grid location-create-grid">
					<label for="new-location-name">
						<span>
							Name <em>*</em>
						</span>
						<ClearableInput
							id="new-location-name"
							placeholder="e.g. Shelf A"
							value={props.manageName}
							onInput={(e) => props.onManageName(e.currentTarget.value)}
							aria-label="New location name"
						/>
					</label>
					<label>
						<span>Parent (optional — nesting)</span>
						<select
							value={props.manageParentId}
							onChange={(e) => props.onManageParentId(e.currentTarget.value)}
							aria-label="Parent location"
						>
							<option value="">— Top level —</option>
							<For each={locationOptions(props.locations)}>
								{(l) => <option value={l.id}>{l.fullPath ?? l.name}</option>}
							</For>
						</select>
					</label>
				</div>
				<div class="form-actions">
					<button type="button" class="primary" onClick={props.onAdd}>
						<IconPlus size={15} /> Add location
					</button>
				</div>
			</section>
			<section class="panel catalog-section">
				<div class="catalog-section-header">
					<h3>All locations</h3>
					<span class="catalog-count">{props.locations.length}</span>
				</div>
				<div class="inline-create">
					<ClearableInput
						placeholder="Filter locations…"
						value={search()}
						onInput={(e) => setSearch(e.currentTarget.value)}
						aria-label="Filter locations"
					/>
				</div>
				<Show
					when={!props.locationsLoading && matchingLocations().length > 0}
					fallback={
						<p class="muted small">
							{search().trim()
								? 'No matching locations.'
								: 'No locations yet — create rooms, shelves…'}
						</p>
					}
				>
					<div class="catalog-table-wrap">
						<table class="catalog-table location-table" aria-label="Locations list">
							<thead>
								<tr>
									<th scope="col">Name</th>
									<th scope="col">Parent</th>
									<th scope="col">Books</th>
									<th scope="col">
										<span class="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={matchingLocations()}>
									{(l) => (
										<tr>
											<td
												class="catalog-table-name"
												title={l.fullPath ?? l.name}
												style={
													search().trim()
														? undefined
														: `padding-left: ${0.45 + Math.min(l.depth ?? 0, 6) * 1.25}rem`
												}
											>
												<strong>{l.name}</strong>
												<Show when={l.fullPath && l.fullPath !== l.name}>
													<span class="location-full-path">{l.fullPath}</span>
												</Show>
											</td>
											<td>
												<select
													value={l.parentId ?? ''}
													onChange={(e) => props.onMove(l.id, e.currentTarget.value)}
													aria-label={`Move ${l.name}`}
													title="Move to another parent"
												>
													<option value="">Top level</option>
													<For
														each={props.locations.filter(
															(o) =>
																o.id !== l.id &&
																!locationDescendantIds(props.locations, l.id).has(o.id),
														)}
													>
														{(o) => <option value={o.id}>{o.fullPath ?? o.name}</option>}
													</For>
												</select>
											</td>
											<td class="catalog-table-books">{l.bookCount ?? 0}</td>
											<td>
												<span class="manage-actions">
													<button
														type="button"
														class="ghost small-btn catalog-rename-btn"
														onClick={() => props.onRename(l.id, l.name)}
														aria-label={`Rename ${l.name}`}
														title={`Rename ${l.name}`}
													>
														<IconEdit size={14} />
													</button>
													<button
														type="button"
														class="danger-ghost"
														onClick={() => props.onRemove(l.id, l.name)}
														aria-label={`Delete ${l.name}`}
														title={`Delete ${l.name}`}
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
				</Show>
			</section>
		</>
	)
}
