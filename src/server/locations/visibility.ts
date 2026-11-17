// Which locations a caller may see (DESIGN §4.5 + §3.1).
//  - admins and members: the whole tree. Locations are household structure,
//    not anyone's property; members create and edit them (§3.5).
//  - guests: only the locations on the path of an item they can see (its
//    location and ancestors): enough to find the shared thing, and no room
//    names ("Lenas Zimmer") beyond that.
import { sql } from "drizzle-orm";
import { visibleItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { DbOrTx } from "../db/client";
import { items, locations } from "../db/schema";

/** null = every location; otherwise the set of visible location ids. */
export function visibleLocationIds(db: DbOrTx, ctx: AuthCtx): Set<string> | null {
  if (ctx.role !== "guest") return null;
  const rows = db.all<{ id: string }>(sql`
    with recursive vis(id) as (
      select distinct ${items.locationId} from ${items}
        where ${items.locationId} is not null and ${visibleItemsWhere(ctx)}
      union
      select l.parent_id from ${locations} l join vis on l.id = vis.id where l.parent_id is not null
    )
    select id from vis`);
  return new Set(rows.map((r) => r.id));
}

export function canSeeLocation(visible: Set<string> | null, id: string): boolean {
  return visible === null || visible.has(id);
}

export type LocationCrumb = { id: string; name: string; shortCode: string | null };

/** The location and its ancestors, root first (cycle-safe). */
export function locationChain(db: DbOrTx, locationId: string): LocationCrumb[] {
  const rows = db.all<LocationCrumb & { depth: number }>(sql`
    with recursive up(id, depth) as (
      select ${locationId}, 0
      union all
      select l.parent_id, up.depth + 1 from ${locations} l join up on l.id = up.id
        where l.parent_id is not null and up.depth < 100
    )
    select l.id as id, l.name as name, l.short_code as shortCode, up.depth as depth
      from up join ${locations} l on l.id = up.id
      order by up.depth desc`);
  return rows.map(({ id, name, shortCode }) => ({ id, name, shortCode }));
}

/** Ids of the location and all its descendants. */
export function locationSubtreeIds(db: DbOrTx, locationId: string): string[] {
  return db
    .all<{ id: string }>(sql`
      with recursive down(id, depth) as (
        select ${locationId}, 0
        union all
        select l.id, down.depth + 1 from ${locations} l join down on l.parent_id = down.id
          where down.depth < 100
      )
      select distinct id from down`)
    .map((r) => r.id);
}
