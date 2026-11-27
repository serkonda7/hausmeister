// Where an item is: its location and its container chain (DESIGN §4.5).
//
// Invariant: an item inside a container has the container's (effective)
// location in its own location_id. Moving a container rewrites location_id of
// everything inside it (derived data: no version bump, no event; the
// container's move event covers it). That keeps "location incl. sub-locations"
// filters a plain IN over location_id.
import { and, inArray, sql } from 'drizzle-orm'
import type { Crumb } from '../../lib/items/types'
import { visibleItemsWhere } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { DbOrTx } from '../db/client'
import { type Item, items } from '../db/schema'
import { locationChain } from '../locations/visibility'

const MAX_DEPTH = 100

type ContainerRow = Pick<
	Item,
	'id' | 'name' | 'shortCode' | 'ownerKind' | 'ownerId' | 'visibility' | 'locationId'
>

/** The containers around an item, direct container first. */
export function containerAncestors(db: DbOrTx, itemId: string): ContainerRow[] {
	return db.all<ContainerRow>(sql`
    with recursive up(id, depth) as (
      select ${items.containerItemId}, 1 from ${items}
        where ${items.id} = ${itemId} and ${items.containerItemId} is not null
      union all
      select i.container_item_id, up.depth + 1 from ${items} i join up on i.id = up.id
        where i.container_item_id is not null and up.depth < ${MAX_DEPTH}
    )
    select i.id as id, i.name as name, i.short_code as shortCode, i.owner_kind as ownerKind,
           i.owner_id as ownerId, i.visibility as visibility, i.location_id as locationId
      from up join ${items} i on i.id = up.id
      order by up.depth`)
}

/** Every item inside this one, at any depth. */
export function descendantIds(db: DbOrTx, itemId: string): string[] {
	return db
		.all<{ id: string }>(sql`
      with recursive down(id, depth) as (
        select ${items.id}, 1 from ${items} where ${items.containerItemId} = ${itemId}
        union
        select i.id, down.depth + 1 from ${items} i join down on i.container_item_id = down.id
          where down.depth < ${MAX_DEPTH}
      )
      select distinct id from down`)
		.map((r) => r.id)
}

/** True when putting `itemId` into `containerId` would close a loop. */
export function wouldContainCycle(db: DbOrTx, itemId: string, containerId: string): boolean {
	if (itemId === containerId) return true
	return containerAncestors(db, containerId).some((c) => c.id === itemId)
}

/** Gives everything inside `itemId` the location `locationId`. */
export function syncDescendantLocations(db: DbOrTx, itemId: string, locationId: string | null) {
	const ids = descendantIds(db, itemId)
	for (let i = 0; i < ids.length; i += 400)
		db.update(items)
			.set({ locationId })
			.where(inArray(items.id, ids.slice(i, i + 400)))
			.run()
}

/**
 * Breadcrumbs: the location chain (root first), then the containers (outermost
 * first). Containers the caller cannot see become one { kind: "hidden" } step
 * each run, so neither their names nor their number leak.
 */
export function itemPath(
	db: DbOrTx,
	ctx: AuthCtx,
	item: Pick<Item, 'id' | 'locationId' | 'containerItemId'>,
): Crumb[] {
	const path: Crumb[] = item.locationId
		? locationChain(db, item.locationId).map((l) => ({ kind: 'location' as const, ...l }))
		: []
	if (!item.containerItemId) return path
	const containers = containerAncestors(db, item.id).reverse()
	const visible = visibleItemIds(
		db,
		ctx,
		containers.map((c) => c.id),
	)
	for (const c of containers) {
		if (visible.has(c.id))
			path.push({ kind: 'item', id: c.id, name: c.name, shortCode: c.shortCode })
		else if (path.at(-1)?.kind !== 'hidden') path.push({ kind: 'hidden' })
	}
	return path
}

/** Of the given item ids, those the caller can see (SQL visibility predicate). */
export function visibleItemIds(
	db: DbOrTx,
	ctx: AuthCtx,
	ids: readonly (string | null | undefined)[],
): Set<string> {
	const unique = [...new Set(ids.filter((x): x is string => !!x))]
	const out = new Set<string>()
	for (let i = 0; i < unique.length; i += 400)
		for (const r of db
			.select({ id: items.id })
			.from(items)
			.where(and(inArray(items.id, unique.slice(i, i + 400)), visibleItemsWhere(ctx)))
			.all())
			out.add(r.id)
	return out
}
