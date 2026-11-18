// Writes item, location and tag events to the `events` log (DESIGN §5.7).
// Item events carry item_id; location and tag events have item_id NULL.
// Like recordEvent (../audit.ts) it refuses secret-looking diff keys, except
// under "attributes.*": those are user-defined field keys holding user data
// (a field "passport_no" must not break saving an item).
import { findSecretKey } from "../audit";
import type { DbOrTx } from "../db/client";
import { events } from "../db/schema";

/** Attribute changes appear in item diffs as "attributes.<key>": { from, to }. */
export const ATTRIBUTE_PREFIX = "attributes.";

export type ItemEventAction =
  | "item.created"
  | "item.updated"
  | "item.moved"
  | "item.status_changed"
  | "item.type_changed"
  | "item.owner_changed"
  | "item.visibility_changed"
  | "item.grant_set"
  | "item.grant_removed"
  | "item.deleted"
  | "item.stock_adjusted"
  | "item.loan_requested"
  | "item.loan_approved"
  | "item.loan_declined"
  | "item.loan_cancelled"
  | "item.loan_due_changed"
  | "item.lent"
  | "item.returned"
  | "item.transfer_started"
  | "item.transfer_declined"
  | "item.transfer_cancelled"
  | "item.attributes_migrated"
  | "item.relation_added"
  | "item.relation_removed";

export type CatalogEventAction =
  | "location.created"
  | "location.updated"
  | "location.moved"
  | "location.deleted"
  | "tag.created"
  | "tag.renamed"
  | "tag.recolored"
  | "tag.merged"
  | "tag.deleted";

export function recordItemEvent(
  db: DbOrTx,
  e: {
    actorId: string | null;
    action: ItemEventAction;
    itemId: string;
    diff: Record<string, unknown>;
    at?: Date;
  },
) {
  const own = Object.fromEntries(
    Object.entries(e.diff).filter(([k]) => !k.startsWith(ATTRIBUTE_PREFIX)),
  );
  const bad = findSecretKey(own);
  if (bad) throw new Error(`Refusing to log secret-looking key "${bad}" in ${e.action}`);
  db.insert(events)
    .values({ itemId: e.itemId, actorId: e.actorId, action: e.action, diff: e.diff, at: e.at })
    .run();
}

export function recordCatalogEvent(
  db: DbOrTx,
  e: { actorId: string | null; action: CatalogEventAction; diff: Record<string, unknown> },
) {
  const bad = findSecretKey(e.diff);
  if (bad) throw new Error(`Refusing to log secret-looking key "${bad}" in ${e.action}`);
  db.insert(events)
    .values({ itemId: null, actorId: e.actorId, action: e.action, diff: e.diff })
    .run();
}
