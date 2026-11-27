// Seeds the starter templates exactly once per instance, without a schema
// change: an `events` row with action TEMPLATES_SEEDED_ACTION is the marker.
//  - marker present          -> do nothing (deleted templates never come back)
//  - no marker, no types yet -> insert the templates, write the marker
//  - no marker, types exist  -> not a fresh instance: only write the marker
// Relative imports: this runs from the Nitro startup plugin, outside Vite's `~` alias.
import { eq } from 'drizzle-orm'
import type { AppDb } from '../db/client'
import { events, itemTypes } from '../db/schema'
import { STARTER_TEMPLATES } from './templates'

export const TEMPLATES_SEEDED_ACTION = 'item_type.templates_seeded'

/** Returns true when templates were inserted by this call. */
export function seedStarterTemplates(db: AppDb): boolean {
	return db.transaction((tx) => {
		const marker = tx
			.select({ id: events.id })
			.from(events)
			.where(eq(events.action, TEMPLATES_SEEDED_ACTION))
			.get()
		if (marker) return false
		const anyType = tx.select({ id: itemTypes.id }).from(itemTypes).limit(1).get()
		const ids = new Map<string, string>()
		if (!anyType) {
			for (const t of STARTER_TEMPLATES) {
				const row = tx
					.insert(itemTypes)
					.values({
						key: t.key,
						name: t.name,
						icon: t.icon,
						tracking: t.tracking,
						parentId: t.parentKey ? (ids.get(t.parentKey) ?? null) : null,
						fields: t.fields,
						createdBy: null,
					})
					.returning({ id: itemTypes.id })
					.get()
				ids.set(t.key, row.id)
			}
		}
		tx.insert(events)
			.values({
				itemId: null,
				actorId: null,
				action: TEMPLATES_SEEDED_ACTION,
				diff: { keys: [...ids.keys()] },
			})
			.run()
		return ids.size > 0
	})
}
