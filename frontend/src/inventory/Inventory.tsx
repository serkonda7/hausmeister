// Inventory + asset management page.
//
// SEPARATION: this page (with `api.ts` next to it) is the inventory bounded
// context on the frontend. It talks only to `/api/inventory/*` via
// `inventoryApi` and never imports the finance client (`../lib/api.ts`).
// Shared, domain-free UI primitives (`../components/*`, `../lib/crud.ts`,
// `../lib/format.ts`, `../lib/money.ts`) are reused — they carry no finance
// logic.
import { createMemo, createResource, createSignal, For, type JSX, Show } from 'solid-js'
import CrudForm from '../components/CrudForm'
import CrudRow from '../components/CrudRow'
import DateInput from '../components/DateInput'
import EmptyState from '../components/EmptyState'
import Field, { SelectField, TextField } from '../components/Field'
import PageHeader from '../components/PageHeader'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { assetStatusEnum } from '../lib/enums'
import { patchForm } from '../lib/form'
import { formatDateISO, formatEUR } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import { type Asset, type InventoryItem, type InventoryLocation, inventoryApi } from './api'
import './Inventory.css'

type Tab = 'items' | 'assets' | 'locations'

type LocationForm = { name: string; description: string }
type ItemForm = {
	name: string
	sku: string
	category: string
	quantity: string
	unit: string
	locationId: string
	lowStockAt: string
	notes: string
}
type AssetForm = {
	name: string
	serial: string
	status: string
	locationId: string
	purchaseDate: string
	purchasePrice: string
	warrantyUntil: string
	notes: string
}

const EMPTY_LOCATION: LocationForm = { name: '', description: '' }
const EMPTY_ITEM: ItemForm = {
	name: '',
	sku: '',
	category: '',
	quantity: '0',
	unit: '',
	locationId: '',
	lowStockAt: '',
	notes: '',
}
const EMPTY_ASSET: AssetForm = {
	name: '',
	serial: '',
	status: 'stored',
	locationId: '',
	purchaseDate: '',
	purchasePrice: '',
	warrantyUntil: '',
	notes: '',
}

function assetStatusLabel(status: string): string {
	return (t().assetStatus as Record<string, string>)[status] ?? status
}

export default function Inventory(): JSX.Element {
	const [tab, setTab] = createSignal<Tab>('items')
	const [summary, { refetch: refetchSummary }] = createResource(() => inventoryApi.summary())
	const [locations, { refetch: refetchLocations }] = createResource(() =>
		inventoryApi.locations.list(),
	)
	const [items, { refetch: refetchItems }] = createResource(() => inventoryApi.items.list())
	const [assets, { refetch: refetchAssets }] = createResource(() => inventoryApi.assets.list())

	async function refresh(): Promise<void> {
		await Promise.all([refetchSummary(), refetchLocations(), refetchItems(), refetchAssets()])
	}

	const locationById = createMemo(() => new Map((locations() ?? []).map((l) => [l.id, l])))
	function locationName(locationId: string | null): string {
		if (!locationId) {
			return t().inventory.noLocation
		}
		return locationById().get(locationId)?.name ?? t().inventory.unknownLocation
	}

	const lowStockIds = createMemo(() => new Set((summary()?.lowStock ?? []).map((i) => i.id)))

	// ---- location CRUD ----
	const locCrud = useCrudForm<LocationForm, InventoryLocation>({ ...EMPTY_LOCATION })
	function openLocationCreate(): void {
		locCrud.openCreate({ ...EMPTY_LOCATION })
	}
	function openLocationEdit(l: InventoryLocation): void {
		locCrud.openEdit(l, { name: l.name, description: l.description ?? '' })
	}
	function submitLocation(e: Event): Promise<void> {
		return locCrud.submit(e, async () => {
			const f = locCrud.form()
			if (f.name.trim() === '') {
				throw new Error(t().inventory.nameRequired)
			}
			const payload = { name: f.name.trim(), description: f.description.trim() || null }
			const editing = locCrud.editing()
			if (editing) {
				await inventoryApi.locations.update(editing.id, payload)
			} else {
				await inventoryApi.locations.create(payload)
			}
			await refresh()
		})
	}
	function removeLocation(l: InventoryLocation): Promise<void> {
		return removeWithConfirm(
			t().inventory.confirmDeleteLocation,
			() => inventoryApi.locations.remove(l.id),
			refresh,
		)
	}

	// ---- item CRUD ----
	const itemCrud = useCrudForm<ItemForm, InventoryItem>({ ...EMPTY_ITEM })
	function openItemCreate(): void {
		itemCrud.openCreate({ ...EMPTY_ITEM })
	}
	function openItemEdit(item: InventoryItem): void {
		itemCrud.openEdit(item, {
			name: item.name,
			sku: item.sku ?? '',
			category: item.category ?? '',
			quantity: item.quantity.toString(),
			unit: item.unit ?? '',
			locationId: item.locationId ?? '',
			lowStockAt: item.lowStockAt?.toString() ?? '',
			notes: item.notes ?? '',
		})
	}
	function parseNonNegativeInt(s: string): number | null {
		if (s.trim() === '') {
			return null
		}
		const n = Number.parseInt(s, 10)
		return Number.isInteger(n) && n >= 0 ? n : Number.NaN
	}
	function submitItem(e: Event): Promise<void> {
		return itemCrud.submit(e, async () => {
			const f = itemCrud.form()
			if (f.name.trim() === '') {
				throw new Error(t().inventory.nameRequired)
			}
			const quantity = parseNonNegativeInt(f.quantity) ?? 0
			const lowStockAt = parseNonNegativeInt(f.lowStockAt)
			if (Number.isNaN(quantity) || Number.isNaN(lowStockAt as number)) {
				throw new Error(t().inventory.invalidNumber)
			}
			const payload = {
				name: f.name.trim(),
				sku: f.sku.trim() || null,
				category: f.category.trim() || null,
				quantity,
				unit: f.unit.trim() || null,
				locationId: f.locationId || null,
				lowStockAt,
				notes: f.notes.trim() || null,
			}
			const editing = itemCrud.editing()
			if (editing) {
				await inventoryApi.items.update(editing.id, payload)
			} else {
				await inventoryApi.items.create(payload)
			}
			await refresh()
		})
	}
	function removeItem(item: InventoryItem): Promise<void> {
		return removeWithConfirm(
			t().inventory.confirmDeleteItem,
			() => inventoryApi.items.remove(item.id),
			refresh,
		)
	}

	// ---- stock adjustment ----
	const adjustCrud = useCrudForm<{ delta: string }, InventoryItem>({ delta: '' })
	function openAdjust(item: InventoryItem): void {
		adjustCrud.openEdit(item, { delta: '' })
	}
	function submitAdjust(e: Event): Promise<void> {
		return adjustCrud.submit(e, async () => {
			const editing = adjustCrud.editing()
			if (!editing) {
				return
			}
			const delta = Number.parseInt(adjustCrud.form().delta, 10)
			if (!Number.isInteger(delta) || delta === 0) {
				throw new Error(t().inventory.invalidDelta)
			}
			await inventoryApi.items.adjust(editing.id, delta)
			await refresh()
		})
	}

	// ---- asset CRUD ----
	const assetCrud = useCrudForm<AssetForm, Asset>({ ...EMPTY_ASSET })
	function openAssetCreate(): void {
		assetCrud.openCreate({ ...EMPTY_ASSET })
	}
	function openAssetEdit(a: Asset): void {
		assetCrud.openEdit(a, {
			name: a.name,
			serial: a.serial ?? '',
			status: a.status,
			locationId: a.locationId ?? '',
			purchaseDate: a.purchaseDate ?? '',
			purchasePrice: centsToEuroInput(a.purchasePriceCents),
			warrantyUntil: a.warrantyUntil ?? '',
			notes: a.notes ?? '',
		})
	}
	function submitAsset(e: Event): Promise<void> {
		return assetCrud.submit(e, async () => {
			const f = assetCrud.form()
			if (f.name.trim() === '') {
				throw new Error(t().inventory.nameRequired)
			}
			const purchasePriceCents = parseEuroToCents(f.purchasePrice)
			if (
				purchasePriceCents != null &&
				(Number.isNaN(purchasePriceCents) || purchasePriceCents < 0)
			) {
				throw new Error(t().inventory.invalidNumber)
			}
			const payload = {
				name: f.name.trim(),
				serial: f.serial.trim() || null,
				status: (f.status || 'stored') as Asset['status'],
				locationId: f.locationId || null,
				purchaseDate: f.purchaseDate || null,
				purchasePriceCents,
				warrantyUntil: f.warrantyUntil || null,
				notes: f.notes.trim() || null,
			}
			const editing = assetCrud.editing()
			if (editing) {
				await inventoryApi.assets.update(editing.id, payload)
			} else {
				await inventoryApi.assets.create(payload)
			}
			await refresh()
		})
	}
	function removeAsset(a: Asset): Promise<void> {
		return removeWithConfirm(
			t().inventory.confirmDeleteAsset,
			() => inventoryApi.assets.remove(a.id),
			refresh,
		)
	}

	const dict = () => t().inventory

	return (
		<div class="page">
			<PageHeader title={dict().title} subtitle={dict().subtitle} />

			<Show when={summary()}>
				{(s) => (
					<div class="inv-stats">
						<div class="inv-stat">
							<div class="inv-stat-value">{s().counts.items}</div>
							<div class="inv-stat-label">{dict().itemsCount}</div>
						</div>
						<div class="inv-stat">
							<div class="inv-stat-value">{s().totalUnits}</div>
							<div class="inv-stat-label">{dict().unitsInStock}</div>
						</div>
						<div class="inv-stat">
							<div class="inv-stat-value">{s().counts.assets}</div>
							<div class="inv-stat-label">{dict().assetsCount}</div>
						</div>
						<div class="inv-stat">
							<div class="inv-stat-value">{formatEUR(s().totalAssetValueCents)}</div>
							<div class="inv-stat-label">{dict().assetValue}</div>
						</div>
						<div class="inv-stat">
							<div class="inv-stat-value">{s().lowStock.length}</div>
							<div class="inv-stat-label">{dict().lowStock}</div>
						</div>
					</div>
				)}
			</Show>

			<div class="inv-tabs" role="tablist" aria-label={dict().title}>
				<button
					type="button"
					role="tab"
					aria-selected={tab() === 'items'}
					class="inv-tab"
					classList={{ 'inv-tab--active': tab() === 'items' }}
					onClick={() => setTab('items')}
				>
					{dict().tabItems}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab() === 'assets'}
					class="inv-tab"
					classList={{ 'inv-tab--active': tab() === 'assets' }}
					onClick={() => setTab('assets')}
				>
					{dict().tabAssets}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab() === 'locations'}
					class="inv-tab"
					classList={{ 'inv-tab--active': tab() === 'locations' }}
					onClick={() => setTab('locations')}
				>
					{dict().tabLocations}
				</button>
			</div>

			<Show when={tab() === 'items'}>
				<PageHeader
					title={dict().tabItems}
					actions={
						<button type="button" onClick={openItemCreate} class="btn-primary">
							{dict().addItem}
						</button>
					}
				/>
				<div class="list">
					<For each={items() ?? []}>
						{(item) => (
							<div class="card">
								<div class="card-row">
									<div class="inline-row">
										<span class="strong">{item.name}</span>
										<span class="muted text-sm">
											{item.quantity}
											{item.unit ? ` ${item.unit}` : ''}
										</span>
										<Show when={lowStockIds().has(item.id)}>
											<span class="inv-badge inv-badge--warn">
												{dict().lowStockBadge}
											</span>
										</Show>
									</div>
									<div class="card-actions">
										<button
											type="button"
											onClick={() => openAdjust(item)}
											class="btn-ghost"
										>
											{dict().adjust}
										</button>
										<CrudRow
											onEdit={() => openItemEdit(item)}
											onDelete={() => removeItem(item)}
										/>
									</div>
								</div>
								<div class="muted text-sm meta-row">
									<Show when={item.sku}>
										<span>
											{dict().sku}: {item.sku}
										</span>
									</Show>
									<Show when={item.category}>
										<span>{item.category}</span>
									</Show>
									<span>
										{dict().location}: {locationName(item.locationId)}
									</span>
								</div>
							</div>
						)}
					</For>
					<Show when={(items() ?? []).length === 0 && !items.loading}>
						<EmptyState actionLabel={dict().addItem} onAction={openItemCreate}>
							{dict().emptyItems}
						</EmptyState>
					</Show>
				</div>
			</Show>

			<Show when={tab() === 'assets'}>
				<PageHeader
					title={dict().tabAssets}
					actions={
						<button type="button" onClick={openAssetCreate} class="btn-primary">
							{dict().addAsset}
						</button>
					}
				/>
				<div class="list">
					<For each={assets() ?? []}>
						{(a) => (
							<div class="card">
								<div class="card-row">
									<div class="inline-row">
										<span class="strong">{a.name}</span>
										<span class="inv-badge">{assetStatusLabel(a.status)}</span>
									</div>
									<div class="card-actions">
										<CrudRow
											onEdit={() => openAssetEdit(a)}
											onDelete={() => removeAsset(a)}
										/>
									</div>
								</div>
								<div class="muted text-sm meta-row">
									<span>
										{dict().location}: {locationName(a.locationId)}
									</span>
									<Show when={a.serial}>
										<span>
											{dict().serial}: {a.serial}
										</span>
									</Show>
									<Show when={a.purchasePriceCents != null}>
										<span>{formatEUR(a.purchasePriceCents ?? 0)}</span>
									</Show>
									<Show when={a.purchaseDate}>
										<span>
											{dict().purchased}:{' '}
											{formatDateISO(a.purchaseDate ?? '')}
										</span>
									</Show>
									<Show when={a.warrantyUntil}>
										<span>
											{dict().warrantyUntil}:{' '}
											{formatDateISO(a.warrantyUntil ?? '')}
										</span>
									</Show>
								</div>
							</div>
						)}
					</For>
					<Show when={(assets() ?? []).length === 0 && !assets.loading}>
						<EmptyState actionLabel={dict().addAsset} onAction={openAssetCreate}>
							{dict().emptyAssets}
						</EmptyState>
					</Show>
				</div>
			</Show>

			<Show when={tab() === 'locations'}>
				<PageHeader
					title={dict().tabLocations}
					actions={
						<button type="button" onClick={openLocationCreate} class="btn-primary">
							{dict().addLocation}
						</button>
					}
				/>
				<div class="list">
					<For each={locations() ?? []}>
						{(l) => (
							<div class="card">
								<div class="card-row">
									<div class="inline-row">
										<span class="strong">{l.name}</span>
										<Show when={l.description}>
											<span class="muted text-sm">· {l.description}</span>
										</Show>
									</div>
									<div class="card-actions">
										<CrudRow
											onEdit={() => openLocationEdit(l)}
											onDelete={() => removeLocation(l)}
										/>
									</div>
								</div>
							</div>
						)}
					</For>
					<Show when={(locations() ?? []).length === 0 && !locations.loading}>
						<EmptyState actionLabel={dict().addLocation} onAction={openLocationCreate}>
							{dict().emptyLocations}
						</EmptyState>
					</Show>
				</div>
			</Show>

			{/* ---- dialogs ---- */}
			<CrudForm
				open={itemCrud.showForm()}
				error={itemCrud.error()}
				editing={itemCrud.editing()}
				onSubmit={submitItem}
				onCancel={itemCrud.close}
			>
				<div class="form-grid">
					<TextField
						label={dict().name}
						required
						value={itemCrud.form().name}
						onInput={(v) => patchForm(itemCrud.setForm, 'name', v)}
					/>
					<TextField
						label={dict().sku}
						placeholder={dict().skuPlaceholder}
						value={itemCrud.form().sku}
						onInput={(v) => patchForm(itemCrud.setForm, 'sku', v)}
					/>
					<TextField
						label={dict().category}
						placeholder={dict().categoryPlaceholder}
						value={itemCrud.form().category}
						onInput={(v) => patchForm(itemCrud.setForm, 'category', v)}
					/>
					<TextField
						label={dict().quantity}
						type="number"
						min="0"
						step="1"
						value={itemCrud.form().quantity}
						onInput={(v) => patchForm(itemCrud.setForm, 'quantity', v)}
					/>
					<TextField
						label={dict().unit}
						placeholder={dict().unitPlaceholder}
						value={itemCrud.form().unit}
						onInput={(v) => patchForm(itemCrud.setForm, 'unit', v)}
					/>
					<SelectField
						label={dict().location}
						value={itemCrud.form().locationId}
						onChange={(v) => patchForm(itemCrud.setForm, 'locationId', v)}
					>
						<option value="">{t().common.none}</option>
						<For each={locations() ?? []}>
							{(l) => <option value={l.id}>{l.name}</option>}
						</For>
					</SelectField>
					<TextField
						label={dict().lowStockAt}
						type="number"
						min="0"
						step="1"
						value={itemCrud.form().lowStockAt}
						onInput={(v) => patchForm(itemCrud.setForm, 'lowStockAt', v)}
					/>
					<TextField
						label={dict().notes}
						value={itemCrud.form().notes}
						onInput={(v) => patchForm(itemCrud.setForm, 'notes', v)}
					/>
				</div>
			</CrudForm>

			<CrudForm
				open={adjustCrud.showForm()}
				error={adjustCrud.error()}
				editing={adjustCrud.editing()}
				onSubmit={submitAdjust}
				onCancel={adjustCrud.close}
			>
				<Field label={dict().delta}>
					<p class="form-hint">{dict().deltaHint}</p>
					<input
						type="number"
						step="1"
						value={adjustCrud.form().delta}
						onInput={(e) =>
							patchForm(adjustCrud.setForm, 'delta', e.currentTarget.value)
						}
						class="input"
						aria-label={dict().delta}
					/>
				</Field>
			</CrudForm>

			<CrudForm
				open={assetCrud.showForm()}
				error={assetCrud.error()}
				editing={assetCrud.editing()}
				onSubmit={submitAsset}
				onCancel={assetCrud.close}
			>
				<div class="form-grid">
					<TextField
						label={dict().name}
						required
						value={assetCrud.form().name}
						onInput={(v) => patchForm(assetCrud.setForm, 'name', v)}
					/>
					<TextField
						label={dict().serial}
						value={assetCrud.form().serial}
						onInput={(v) => patchForm(assetCrud.setForm, 'serial', v)}
					/>
					<SelectField
						label={dict().status}
						value={assetCrud.form().status}
						onChange={(v) => patchForm(assetCrud.setForm, 'status', v)}
					>
						<For each={[...assetStatusEnum]}>
							{(s) => <option value={s}>{assetStatusLabel(s)}</option>}
						</For>
					</SelectField>
					<SelectField
						label={dict().location}
						value={assetCrud.form().locationId}
						onChange={(v) => patchForm(assetCrud.setForm, 'locationId', v)}
					>
						<option value="">{t().common.none}</option>
						<For each={locations() ?? []}>
							{(l) => <option value={l.id}>{l.name}</option>}
						</For>
					</SelectField>
					<Field label={dict().purchaseDate}>
						<DateInput
							value={assetCrud.form().purchaseDate}
							onInput={(v) => patchForm(assetCrud.setForm, 'purchaseDate', v)}
							aria-label={dict().purchaseDate}
						/>
					</Field>
					<TextField
						label={dict().purchasePrice}
						type="number"
						step="0.01"
						value={assetCrud.form().purchasePrice}
						onInput={(v) => patchForm(assetCrud.setForm, 'purchasePrice', v)}
					/>
					<Field label={dict().warrantyUntil}>
						<DateInput
							value={assetCrud.form().warrantyUntil}
							onInput={(v) => patchForm(assetCrud.setForm, 'warrantyUntil', v)}
							aria-label={dict().warrantyUntil}
						/>
					</Field>
					<TextField
						label={dict().notes}
						value={assetCrud.form().notes}
						onInput={(v) => patchForm(assetCrud.setForm, 'notes', v)}
					/>
				</div>
			</CrudForm>

			<CrudForm
				open={locCrud.showForm()}
				error={locCrud.error()}
				editing={locCrud.editing()}
				onSubmit={submitLocation}
				onCancel={locCrud.close}
			>
				<div class="form-grid">
					<TextField
						label={dict().name}
						required
						value={locCrud.form().name}
						onInput={(v) => patchForm(locCrud.setForm, 'name', v)}
					/>
					<TextField
						label={dict().description}
						value={locCrud.form().description}
						onInput={(v) => patchForm(locCrud.setForm, 'description', v)}
					/>
				</div>
			</CrudForm>
		</div>
	)
}
