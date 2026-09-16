// Inventory + asset management API client.
//
// SEPARATION: this module is the inventory bounded context on the frontend.
// It talks only to `/api/inventory/*` and never imports from the finance
// client (`../lib/api.ts`). Shared UI primitives (`../components/*`,
// `../lib/crud.ts`, `../lib/format.ts`, `../lib/money.ts`) and the shared
// picklists (`../lib/enums.ts` → `@homie/contracts`) are the only shared
// dependencies.
import type { AssetStatus } from '../lib/enums'

export type { AssetStatus } from '../lib/enums'

export interface InventoryLocation {
	id: string
	name: string
	description: string | null
	createdAt: string
}

export interface InventoryItem {
	id: string
	name: string
	sku: string | null
	category: string | null
	quantity: number
	unit: string | null
	locationId: string | null
	lowStockAt: number | null
	notes: string | null
	createdAt: string
}

export interface Asset {
	id: string
	name: string
	serial: string | null
	status: AssetStatus
	locationId: string | null
	purchaseDate: string | null
	purchasePriceCents: number | null
	warrantyUntil: string | null
	notes: string | null
	createdAt: string
}

export interface InventorySummary {
	counts: { locations: number; items: number; assets: number }
	totalUnits: number
	lowStock: InventoryItem[]
	assetsByStatus: Record<string, number>
	totalAssetValueCents: number
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
	const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
	if (!res.ok) {
		const text = await res.text()
		throw new Error(`${res.status} ${text}`)
	}
	if (res.status === 204) {
		return undefined as T
	}
	return res.json() as Promise<T>
}

interface CrudResource<T, Create, Update> {
	list: () => Promise<T[]>
	create: (d: Create) => Promise<T>
	update: (id: string, d: Update) => Promise<T>
	remove: (id: string) => Promise<{ ok: true }>
}

/** Local copy of the CRUD wrapper so this module never imports the finance client. */
function crud<T, Create, Update>(path: string): CrudResource<T, Create, Update> {
	return {
		list: () => req<T[]>(path),
		create: (d: Create) => req<T>(path, { method: 'POST', body: JSON.stringify(d) }),
		update: (id: string, d: Update) =>
			req<T>(`${path}/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
		remove: (id: string) => req<{ ok: true }>(`${path}/${id}`, { method: 'DELETE' }),
	}
}

type LocationCreate = Omit<InventoryLocation, 'id' | 'createdAt'>
type LocationUpdate = Partial<LocationCreate>
type ItemCreate = Omit<InventoryItem, 'id' | 'createdAt'>
type ItemUpdate = Partial<ItemCreate>
type AssetCreate = Omit<Asset, 'id' | 'createdAt'>
type AssetUpdate = Partial<AssetCreate>

export const inventoryApi = {
	summary: () => req<InventorySummary>('/api/inventory/summary'),
	locations: crud<InventoryLocation, LocationCreate, LocationUpdate>('/api/inventory/locations'),
	items: {
		...crud<InventoryItem, ItemCreate, ItemUpdate>('/api/inventory/items'),
		adjust: (id: string, delta: number) =>
			req<InventoryItem>(`/api/inventory/items/${id}/adjust`, {
				method: 'POST',
				body: JSON.stringify({ delta }),
			}),
	},
	assets: crud<Asset, AssetCreate, AssetUpdate>('/api/inventory/assets'),
}
