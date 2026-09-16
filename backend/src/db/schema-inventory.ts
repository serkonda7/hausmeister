// Inventory + asset management tables.
//
// SEPARATION: this file is the inventory bounded context. It must not import
// from `./schema.ts` (finance) and finance code must not import from here.
// The only shared dependency is `@homie/contracts` (picklists). No foreign
// keys cross the boundary in either direction.
import type { AssetStatus } from '@homie/contracts'
import { assetStatusEnum } from '@homie/contracts'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export type { AssetStatus }
export { assetStatusEnum }

export const inventoryLocations = sqliteTable('inventory_locations', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	description: text('description'),
	createdAt: text('created_at').notNull(),
})

export const inventoryItems = sqliteTable(
	'inventory_items',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		sku: text('sku').unique(),
		category: text('category'),
		// Bulk stock level. Individually tracked valuables live in `assets`.
		quantity: integer('quantity').notNull().default(0),
		unit: text('unit'),
		locationId: text('location_id').references(() => inventoryLocations.id, {
			onDelete: 'set null',
		}),
		// Optional low-stock threshold; `quantity <= lowStockAt` flags the item.
		lowStockAt: integer('low_stock_at'),
		notes: text('notes'),
		createdAt: text('created_at').notNull(),
	},
	(t) => [index('idx_inventory_items_location').on(t.locationId)],
)

export const assets = sqliteTable(
	'assets',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		serial: text('serial'),
		status: text('status').notNull().$type<AssetStatus>().default('stored'),
		locationId: text('location_id').references(() => inventoryLocations.id, {
			onDelete: 'set null',
		}),
		purchaseDate: text('purchase_date'), // ISO date (YYYY-MM-DD)
		purchasePriceCents: integer('purchase_price_cents'),
		warrantyUntil: text('warranty_until'), // ISO date (YYYY-MM-DD)
		notes: text('notes'),
		createdAt: text('created_at').notNull(),
	},
	(t) => [index('idx_assets_status').on(t.status), index('idx_assets_location').on(t.locationId)],
)

export type InventoryLocation = typeof inventoryLocations.$inferSelect
export type NewInventoryLocation = typeof inventoryLocations.$inferInsert
export type InventoryItem = typeof inventoryItems.$inferSelect
export type NewInventoryItem = typeof inventoryItems.$inferInsert
export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert
