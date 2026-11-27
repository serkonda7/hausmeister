// One-time upgrade of the seeded starter types for v1.2 (DESIGN §4.4, §4.5), on an instance seeded before it.
// An `events` row with action TEMPLATES_UPGRADED_ACTION is the marker, as for the seeding itself (./seed.ts).
//  - Elektronik: "Garantie bis" (warranty_until) becomes the warranty field (`warranty: true`), so its reminders start.
//  - Ersatzteil: the "Passt zu" item field (fits) gives way to item relations. Every reference becomes a "fits" relation (item → referenced item, events reason "fits_field"), the value leaves the item's attributes (item.attributes_migrated) and the field is hidden.
// Only the starter types are touched, found by key, and only while their field still looks as seeded (same key and kind); a type the admins changed differently is left alone.
// Runs from itemsDb() on the first item request (it reindexes, which the startup plugin cannot load).
import { eq, inArray } from 'drizzle-orm'
import { diffFields } from '../../lib/diff'
import type { FieldDefinition } from '../../lib/item-types/fields'
import { typeAndDescendantIds } from '../../lib/item-types/tree'
import type { AppDb } from '../db/client'
import { events, items, itemTypes } from '../db/schema'
import { recordItemEvent } from '../history/record'
import { insertRelation } from '../relations/service'
import { reindexItems } from '../search/indexer'
import { loadTypes } from './service'

export const TEMPLATES_UPGRADED_ACTION = 'item_type.templates_upgraded_v1_2'

export type UpgradeResult = { warranty: boolean; fitsItems: number; fitsRelations: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns null when the upgrade had already run. */
export function upgradeStarterTypes(db: AppDb): UpgradeResult | null {
	return db.transaction((tx) => {
		const d = tx as unknown as AppDb
		const marker = tx
			.select({ id: events.id })
			.from(events)
			.where(eq(events.action, TEMPLATES_UPGRADED_ACTION))
			.get()
		if (marker) return null
		const result: UpgradeResult = { warranty: false, fitsItems: 0, fitsRelations: 0 }
		const types = loadTypes(d)
		const setFields = (id: string, fields: FieldDefinition[]) =>
			tx.update(itemTypes).set({ fields }).where(eq(itemTypes.id, id)).run()

		const electronics = types.find((t) => t.key === 'electronics')
		const warranty = electronics?.fields.find((f) => f.key === 'warranty_until')
		if (electronics && warranty?.kind === 'date' && warranty.warranty === undefined) {
			setFields(
				electronics.id,
				electronics.fields.map((f) => (f === warranty ? { ...f, warranty: true } : f)),
			)
			result.warranty = true
		}

		const spare = types.find((t) => t.key === 'spare_part')
		const fits = spare?.fields.find((f) => f.key === 'fits')
		if (spare && fits?.kind === 'item' && !fits.hidden) {
			const typeIds = typeAndDescendantIds(types, spare.id)
			const rows = tx
				.select({ id: items.id, attributes: items.attributes, version: items.version })
				.from(items)
				.where(inArray(items.typeId, typeIds))
				.all()
				.filter((r) => r.attributes && 'fits' in r.attributes)
			const targets = new Set(
				rows.flatMap((r) => {
					const v = r.attributes.fits
					return (Array.isArray(v) ? v : [v]).filter(
						(x): x is string => typeof x === 'string' && UUID.test(x),
					)
				}),
			)
			const existing = new Set<string>()
			const list = [...targets]
			for (let i = 0; i < list.length; i += 400)
				for (const r of tx
					.select({ id: items.id })
					.from(items)
					.where(inArray(items.id, list.slice(i, i + 400)))
					.all())
					existing.add(r.id)
			for (const r of rows) {
				const v = r.attributes.fits
				for (const to of Array.isArray(v) ? v : [v])
					if (typeof to === 'string' && to !== r.id && existing.has(to))
						if (
							insertRelation(
								tx,
								null,
								{ fromItemId: r.id, toItemId: to, kind: 'fits' },
								{ reason: 'fits_field' },
							)
						)
							result.fitsRelations++
				const { fits: _dropped, ...rest } = r.attributes
				tx.update(items)
					.set({ attributes: rest, version: r.version + 1 })
					.where(eq(items.id, r.id))
					.run()
				recordItemEvent(tx, {
					actorId: null,
					action: 'item.attributes_migrated',
					itemId: r.id,
					diff: {
						typeId: spare.id,
						reason: 'fits_field',
						removed: ['fits'],
						attributes: diffFields(r.attributes, rest),
					},
				})
				result.fitsItems++
			}
			setFields(
				spare.id,
				spare.fields.map((f) => (f === fits ? { ...f, hidden: true } : f)),
			)
			reindexItems(
				tx,
				rows.map((r) => r.id),
			)
		}

		tx.insert(events)
			.values({
				itemId: null,
				actorId: null,
				action: TEMPLATES_UPGRADED_ACTION,
				diff: result,
			})
			.run()
		return result
	})
}
