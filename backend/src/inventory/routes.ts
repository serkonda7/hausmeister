// Inventory + asset management HTTP routes (Hono sub-app).
//
// SEPARATION: this module is the inventory bounded context. It imports only
// the inventory schema/validators, the shared db handle, and contracts —
// never finance code (`../index.ts`, `../validators.ts`, `./schema.ts`).
// Small helpers (`id`, `now`, `mergePatch`, `findByIdOrNull`) are duplicated
// from the finance app on purpose so neither side can drift the other.
// Mounted in `../index.ts` via `app.route('/inventory', inventoryApp)`.
import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { db } from '../db/index'
import { assets, inventoryItems, inventoryLocations } from '../db/schema-inventory'
import {
	assetCreateSchema,
	assetUpdateSchema,
	itemAdjustSchema,
	itemCreateSchema,
	itemUpdateSchema,
	locationCreateSchema,
	locationUpdateSchema,
} from './validators'

export const inventoryApp = new Hono()

function id(): string {
	return crypto.randomUUID()
}
function now(): string {
	return new Date().toISOString()
}

// Nullable PATCH merge — `undefined` keeps existing, `null` clears.
function mergePatch<T>(existing: T | null, incoming: T | null | undefined): T | null {
	return incoming !== undefined ? (incoming ?? null) : existing
}

async function findByIdOrNull<TRow>(table: object, rowId: string): Promise<TRow | null> {
	const idCol = (table as { id: Parameters<typeof eq>[0] }).id
	const rows = await db
		.select()
		.from(table as never)
		.where(eq(idCol, rowId))
		.limit(1)
	return (rows[0] as TRow | undefined) ?? null
}

type LocationRow = typeof inventoryLocations.$inferSelect
type ItemRow = typeof inventoryItems.$inferSelect
type AssetRow = typeof assets.$inferSelect

// ============ LOCATIONS ============
inventoryApp.get('/locations', async (c) => {
	const rows = await db.select().from(inventoryLocations).orderBy(inventoryLocations.name)
	return c.json(rows)
})

inventoryApp.post('/locations', vValidator('json', locationCreateSchema), async (c) => {
	const data = c.req.valid('json')
	const row = {
		id: id(),
		name: data.name.trim(),
		description: data.description ?? null,
		createdAt: now(),
	}
	try {
		await db.insert(inventoryLocations).values(row)
	} catch {
		return c.json({ error: 'Location name already exists' }, 409)
	}
	return c.json(row, 201)
})

inventoryApp.get('/locations/:id', async (c) => {
	const row = await findByIdOrNull<LocationRow>(inventoryLocations, c.req.param('id'))
	if (!row) {
		return c.json({ error: 'Location not found' }, 404)
	}
	return c.json(row)
})

inventoryApp.put('/locations/:id', vValidator('json', locationUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<LocationRow>(inventoryLocations, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Location not found' }, 404)
	}
	const updated = {
		name: data.name?.trim() ?? existing.name,
		description: mergePatch(existing.description, data.description),
	}
	try {
		await db
			.update(inventoryLocations)
			.set(updated)
			.where(eq(inventoryLocations.id, c.req.param('id')))
	} catch {
		return c.json({ error: 'Location name already exists' }, 409)
	}
	return c.json({ ...existing, ...updated })
})

inventoryApp.delete('/locations/:id', async (c) => {
	// Items/assets keep their history; location FK is SET NULL.
	await db.delete(inventoryLocations).where(eq(inventoryLocations.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ ITEMS (bulk stock) ============
inventoryApp.get('/items', async (c) => {
	const locationId = c.req.query('locationId')
	const lowStockOnly = c.req.query('lowStock') === '1'
	let rows = locationId
		? await db
				.select()
				.from(inventoryItems)
				.where(eq(inventoryItems.locationId, locationId))
				.orderBy(inventoryItems.name)
		: await db.select().from(inventoryItems).orderBy(inventoryItems.name)
	if (lowStockOnly) {
		rows = rows.filter((r) => r.lowStockAt != null && r.quantity <= r.lowStockAt)
	}
	return c.json(rows)
})

inventoryApp.post('/items', vValidator('json', itemCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (data.locationId != null && !(await findByIdOrNull(inventoryLocations, data.locationId))) {
		return c.json({ error: 'Location not found' }, 404)
	}
	const row = {
		id: id(),
		name: data.name.trim(),
		sku: data.sku?.trim() ? data.sku.trim() : null,
		category: data.category?.trim() ? data.category.trim() : null,
		quantity: data.quantity ?? 0,
		unit: data.unit?.trim() ? data.unit.trim() : null,
		locationId: data.locationId ?? null,
		lowStockAt: data.lowStockAt ?? null,
		notes: data.notes ?? null,
		createdAt: now(),
	}
	try {
		await db.insert(inventoryItems).values(row)
	} catch {
		return c.json({ error: 'SKU already exists' }, 409)
	}
	return c.json(row, 201)
})

inventoryApp.get('/items/:id', async (c) => {
	const row = await findByIdOrNull<ItemRow>(inventoryItems, c.req.param('id'))
	if (!row) {
		return c.json({ error: 'Item not found' }, 404)
	}
	return c.json(row)
})

inventoryApp.put('/items/:id', vValidator('json', itemUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<ItemRow>(inventoryItems, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Item not found' }, 404)
	}
	if (data.locationId !== undefined && data.locationId !== null) {
		if (!(await findByIdOrNull(inventoryLocations, data.locationId))) {
			return c.json({ error: 'Location not found' }, 404)
		}
	}
	const updated = {
		name: data.name?.trim() || existing.name,
		sku: data.sku === undefined ? existing.sku : data.sku?.trim() ? data.sku.trim() : null,
		category:
			data.category === undefined
				? existing.category
				: data.category?.trim()
					? data.category.trim()
					: null,
		quantity: data.quantity ?? existing.quantity,
		unit: data.unit === undefined ? existing.unit : data.unit?.trim() ? data.unit.trim() : null,
		locationId: mergePatch(existing.locationId, data.locationId),
		lowStockAt: data.lowStockAt !== undefined ? (data.lowStockAt ?? null) : existing.lowStockAt,
		notes: mergePatch(existing.notes, data.notes),
	}
	try {
		await db
			.update(inventoryItems)
			.set(updated)
			.where(eq(inventoryItems.id, c.req.param('id')))
	} catch {
		return c.json({ error: 'SKU already exists' }, 409)
	}
	return c.json({ ...existing, ...updated })
})

// Stock movement: restock (delta > 0) or consume (delta < 0). Never below zero.
inventoryApp.post('/items/:id/adjust', vValidator('json', itemAdjustSchema), async (c) => {
	const data = c.req.valid('json')
	if (data.delta === 0) {
		return c.json({ error: 'delta must not be zero' }, 422)
	}
	const existing = await findByIdOrNull<ItemRow>(inventoryItems, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Item not found' }, 404)
	}
	const next = existing.quantity + data.delta
	if (next < 0) {
		return c.json(
			{
				error: 'Adjustment would drive quantity below zero',
				current: existing.quantity,
				delta: data.delta,
			},
			422,
		)
	}
	await db
		.update(inventoryItems)
		.set({ quantity: next })
		.where(eq(inventoryItems.id, existing.id))
	return c.json({ ...existing, quantity: next })
})

inventoryApp.delete('/items/:id', async (c) => {
	await db.delete(inventoryItems).where(eq(inventoryItems.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ ASSETS (individually tracked) ============
inventoryApp.get('/assets', async (c) => {
	const status = c.req.query('status')
	const locationId = c.req.query('locationId')
	let rows = await db.select().from(assets).orderBy(assets.name)
	if (status) {
		rows = rows.filter((r) => r.status === status)
	}
	if (locationId) {
		rows = rows.filter((r) => r.locationId === locationId)
	}
	return c.json(rows)
})

inventoryApp.post('/assets', vValidator('json', assetCreateSchema), async (c) => {
	const data = c.req.valid('json')
	if (data.locationId != null && !(await findByIdOrNull(inventoryLocations, data.locationId))) {
		return c.json({ error: 'Location not found' }, 404)
	}
	const row = {
		id: id(),
		name: data.name.trim(),
		serial: data.serial?.trim() ? data.serial.trim() : null,
		status: data.status ?? ('stored' as const),
		locationId: data.locationId ?? null,
		purchaseDate: data.purchaseDate ?? null,
		purchasePriceCents: data.purchasePriceCents ?? null,
		warrantyUntil: data.warrantyUntil ?? null,
		notes: data.notes ?? null,
		createdAt: now(),
	}
	await db.insert(assets).values(row)
	return c.json(row, 201)
})

inventoryApp.get('/assets/:id', async (c) => {
	const row = await findByIdOrNull<AssetRow>(assets, c.req.param('id'))
	if (!row) {
		return c.json({ error: 'Asset not found' }, 404)
	}
	return c.json(row)
})

inventoryApp.put('/assets/:id', vValidator('json', assetUpdateSchema), async (c) => {
	const data = c.req.valid('json')
	const existing = await findByIdOrNull<AssetRow>(assets, c.req.param('id'))
	if (!existing) {
		return c.json({ error: 'Asset not found' }, 404)
	}
	if (data.locationId !== undefined && data.locationId !== null) {
		if (!(await findByIdOrNull(inventoryLocations, data.locationId))) {
			return c.json({ error: 'Location not found' }, 404)
		}
	}
	const updated = {
		name: data.name?.trim() || existing.name,
		serial:
			data.serial === undefined
				? existing.serial
				: data.serial?.trim()
					? data.serial.trim()
					: null,
		status: data.status ?? existing.status,
		locationId: mergePatch(existing.locationId, data.locationId),
		purchaseDate: mergePatch(existing.purchaseDate, data.purchaseDate),
		purchasePriceCents:
			data.purchasePriceCents !== undefined
				? (data.purchasePriceCents ?? null)
				: existing.purchasePriceCents,
		warrantyUntil: mergePatch(existing.warrantyUntil, data.warrantyUntil),
		notes: mergePatch(existing.notes, data.notes),
	}
	await db
		.update(assets)
		.set(updated)
		.where(eq(assets.id, c.req.param('id')))
	return c.json({ ...existing, ...updated })
})

inventoryApp.delete('/assets/:id', async (c) => {
	await db.delete(assets).where(eq(assets.id, c.req.param('id')))
	return c.json({ ok: true })
})

// ============ SUMMARY (inventory-only; finance /summary is untouched) ============
inventoryApp.get('/summary', async (c) => {
	const [locations, items, allAssets] = await Promise.all([
		db.select().from(inventoryLocations),
		db.select().from(inventoryItems),
		db.select().from(assets),
	])
	const lowStock = items.filter((i) => i.lowStockAt != null && i.quantity <= i.lowStockAt)
	const assetsByStatus: Record<string, number> = {}
	for (const a of allAssets) {
		assetsByStatus[a.status] = (assetsByStatus[a.status] ?? 0) + 1
	}
	const totalAssetValueCents = allAssets.reduce((s, a) => s + (a.purchasePriceCents ?? 0), 0)
	return c.json({
		counts: { locations: locations.length, items: items.length, assets: allAssets.length },
		totalUnits: items.reduce((s, i) => s + i.quantity, 0),
		lowStock,
		assetsByStatus,
		totalAssetValueCents,
	})
})
