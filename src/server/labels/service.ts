// Label sheets (DESIGN §5.2): the items and locations to print, with the origin their QR codes point to.
// Only what the caller can see; unknown or invisible ids are left out silently (the sheet is a print job, not an API).
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { idSchema } from '../../lib/items/inputs'
import type { LabelEntry, LabelSheet } from '../../lib/scan/types'
import { visibleItemsWhere } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb } from '../db/client'
import { items, itemTypes, locations } from '../db/schema'
import { parseInput } from '../items/errors'
import { canSeeLocation, locationChain, visibleLocationIds } from '../locations/visibility'

export const MAX_LABELS = 400

export const labelsInput = z.object({
	itemIds: z.array(idSchema).max(MAX_LABELS).default([]),
	locationIds: z.array(idSchema).max(MAX_LABELS).default([]),
})

export function getLabels(
	db: AppDb,
	ctx: AuthCtx,
	origin: string,
	raw: { itemIds?: string[]; locationIds?: string[] },
): LabelSheet {
	const input = parseInput(labelsInput, raw)
	const byItem = new Map<string, LabelEntry>()
	if (input.itemIds.length)
		for (const r of db
			.select({
				id: items.id,
				name: items.name,
				shortCode: items.shortCode,
				type: itemTypes.name,
			})
			.from(items)
			.innerJoin(itemTypes, eq(itemTypes.id, items.typeId))
			.where(and(inArray(items.id, input.itemIds), visibleItemsWhere(ctx)))
			.all())
			if (r.shortCode)
				byItem.set(r.id, {
					kind: 'item',
					id: r.id,
					name: r.name,
					shortCode: r.shortCode,
					context: r.type,
				})
	const byLocation = new Map<string, LabelEntry>()
	if (input.locationIds.length) {
		const vis = visibleLocationIds(db, ctx)
		for (const l of db
			.select({ id: locations.id, name: locations.name, shortCode: locations.shortCode })
			.from(locations)
			.where(inArray(locations.id, input.locationIds))
			.all())
			if (l.shortCode && canSeeLocation(vis, l.id))
				byLocation.set(l.id, {
					kind: 'location',
					id: l.id,
					name: l.name,
					shortCode: l.shortCode,
					context: locationChain(db, l.id)
						.slice(0, -1)
						.map((c) => c.name)
						.join(' › '),
				})
	}
	// The order the caller asked for: locations first (shelves), then items.
	const labels = [
		...input.locationIds.flatMap((id) => byLocation.get(id) ?? []),
		...input.itemIds.flatMap((id) => byItem.get(id) ?? []),
	]
	const seen = new Set<string>()
	return {
		origin,
		labels: labels.filter((l) => !seen.has(l.id) && !!seen.add(l.id)),
	}
}
