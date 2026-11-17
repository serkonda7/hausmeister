// An item's history for a caller (DESIGN §5.7, §3.2: `view` may see history).
// Redaction, applied per event:
//  - below `edit`: price and currency changes are removed from every diff;
//    an item.updated event left without changes disappears entirely; every
//    event about an attachment that is a receipt now or was one at any point
//    (attachment.added/removed/kind_changed) is hidden: receipts are money
//    information (§3.4), and a file reclassified as a receipt must not keep
//    its name visible through an older "other" event.
//  - grant events (item.grant_set / item.grant_removed) only at `manage`:
//    who an item is shared with is the managers' business, like the grant list.
//  - ownership and visibility events are shown to every viewer: owner and
//    visibility are part of what a viewer already sees on the item.
// Names: actors resolve to display names; ids in diffs (owners, principals,
// containers, locations, item references in attributes) come with a `names`
// map, where items and locations appear only if the caller can see them. Ids
// of existing items the caller cannot see (containers, `item` attribute
// values) are replaced by HIDDEN_ITEM, so they never leave the server.
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { historyInput } from "../../lib/items/inputs";
import type { HistoryEntry, HistoryPage, JsonObject } from "../../lib/items/types";
import { m } from "../../paraglide/messages";
import { atLeast, canSeeMoney, type Level } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { attachments, type Event, events, groups, items, locations, users } from "../db/schema";
import { requireItem } from "../items/access";
import { ItemsError, parseInput } from "../items/errors";
import { visibleItemIds } from "../items/placement";
import { canSeeLocation, visibleLocationIds } from "../locations/visibility";

const MONEY_KEYS = ["priceCents", "currency"];
const GRANT_ACTIONS = new Set(["item.grant_set", "item.grant_removed"]);
const ATTACHMENT_ACTIONS = new Set([
  "attachment.added",
  "attachment.removed",
  "attachment.kind_changed",
]);
/** Stands in for the id of an item the caller cannot see (no name resolves to it). */
export const HIDDEN_ITEM = "hidden";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function walkStrings(v: unknown, fn: (s: string) => string): unknown {
  if (typeof v === "string") return fn(v);
  if (Array.isArray(v)) return v.map((x) => walkStrings(x, fn));
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walkStrings(x, fn)]));
  return v;
}

/** Keys that are context, not changes. */
const META_KEYS = new Set(["reason", "removed", "typeId"]);

const isReceiptKind = (kind: unknown): boolean =>
  kind === "receipt" ||
  (!!kind &&
    typeof kind === "object" &&
    ((kind as { from?: unknown }).from === "receipt" ||
      (kind as { to?: unknown }).to === "receipt"));

/**
 * Ids of attachments that are receipts now or were at any point (by their
 * events), for redactEvent. Pass itemIds to limit the lookup to some items.
 */
export function receiptAttachmentIds(db: AppDb, itemIds?: readonly string[]): Set<string> {
  const out = new Set<string>();
  const now = db
    .select({ id: attachments.id })
    .from(attachments)
    .where(
      itemIds
        ? and(eq(attachments.kind, "receipt"), inArray(attachments.itemId, [...itemIds]))
        : eq(attachments.kind, "receipt"),
    )
    .all();
  for (const r of now) out.add(r.id);
  const evs = db
    .select({ diff: events.diff })
    .from(events)
    .where(
      and(
        inArray(events.action, [...ATTACHMENT_ACTIONS]),
        itemIds ? inArray(events.itemId, [...itemIds]) : undefined,
        sql`(json_extract(${events.diff}, '$.kind') = 'receipt' or json_extract(${events.diff}, '$.kind.from') = 'receipt' or json_extract(${events.diff}, '$.kind.to') = 'receipt')`,
      ),
    )
    .all();
  for (const e of evs) {
    const id = (e.diff as { attachmentId?: unknown } | null)?.attachmentId;
    if (typeof id === "string") out.add(id);
  }
  return out;
}

/**
 * The diff as the caller may see it, or null when the whole event is hidden.
 * `receipts` (receiptAttachmentIds) hides every event of an attachment that
 * is or was a receipt; without it only the event's own kind is checked.
 */
export function redactEvent(
  e: Pick<Event, "action" | "diff">,
  level: Level,
  receipts: ReadonlySet<string> = new Set(),
): Record<string, unknown> | null {
  const diff =
    e.diff && typeof e.diff === "object" && !Array.isArray(e.diff)
      ? { ...(e.diff as Record<string, unknown>) }
      : {};
  if (GRANT_ACTIONS.has(e.action) && !atLeast(level, "manage")) return null;
  if (canSeeMoney(level)) return diff;
  if (
    ATTACHMENT_ACTIONS.has(e.action) &&
    (isReceiptKind(diff.kind) ||
      (typeof diff.attachmentId === "string" && receipts.has(diff.attachmentId)))
  )
    return null;
  let removed = false;
  for (const k of MONEY_KEYS)
    if (k in diff) {
      delete diff[k];
      removed = true;
    }
  if (removed && e.action === "item.updated" && Object.keys(diff).every((k) => META_KEYS.has(k)))
    return null;
  return diff;
}

type Cursor = { at: number; id: string };

function decode(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Cursor;
    if (typeof c?.at === "number" && typeof c?.id === "string") return c;
  } catch {
    // fall through
  }
  throw new ItemsError(422, "CURSOR_INVALID");
}

/** Newest first. Pass `nextCursor` back as `cursor` for older entries. */
export function getItemHistory(
  db: AppDb,
  ctx: AuthCtx,
  raw: { itemId: string; cursor?: string; limit?: number },
): HistoryPage {
  const input = parseInput(historyInput, raw);
  const { item, level } = requireItem(db, ctx, input.itemId, "view");
  const limit = input.limit ?? 50;
  const conds = [eq(events.itemId, input.itemId)];
  if (input.cursor) {
    const c = decode(input.cursor);
    conds.push(
      or(
        sql`${events.at} < ${c.at}`,
        and(sql`${events.at} = ${c.at}`, sql`${events.id} < ${c.id}`),
      )!,
    );
  }
  const rows = db
    .select()
    .from(events)
    .where(and(...conds))
    .orderBy(desc(events.at), desc(events.id))
    .limit(limit + 1)
    .all();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  const nextCursor =
    hasMore && last
      ? Buffer.from(JSON.stringify({ at: last.at.getTime(), id: last.id })).toString("base64url")
      : null;

  const receipts = canSeeMoney(level) ? new Set<string>() : receiptAttachmentIds(db, [item.id]);
  const entries: (HistoryEntry & { actorId: string | null })[] = [];
  for (const e of page) {
    const diff = redactEvent(e, level, receipts);
    if (!diff) continue;
    entries.push({
      id: e.id,
      at: e.at,
      action: e.action,
      actor: null,
      actorId: e.actorId,
      diff: diff as JsonObject,
    });
  }

  // Item ids anywhere in the diffs (containers, `item` attributes): hide the
  // ones of existing items the caller cannot see; name the visible ones.
  const candidates = new Set<string>();
  for (const e of entries)
    walkStrings(e.diff, (x) => {
      if (UUID.test(x)) candidates.add(x);
      return x;
    });
  const seen = visibleItemIds(db, ctx, [...candidates]);
  const unseen = [...candidates].filter((id) => !seen.has(id));
  const hiddenItems = new Set<string>();
  for (let i = 0; i < unseen.length; i += 400)
    for (const r of db
      .select({ id: items.id })
      .from(items)
      .where(inArray(items.id, unseen.slice(i, i + 400)))
      .all())
      hiddenItems.add(r.id);
  if (hiddenItems.size)
    for (const e of entries)
      e.diff = walkStrings(e.diff, (x) => (hiddenItems.has(x) ? HIDDEN_ITEM : x)) as JsonObject;

  // Ids to name: actors, owners/principals (users or groups), containers,
  // locations, referenced items.
  const people = new Set<string>();
  const itemIds = new Set<string>(seen);
  const locIds = new Set<string>();
  const collect = (v: unknown, into: Set<string>) => {
    if (typeof v === "string") into.add(v);
    else if (v && typeof v === "object" && "from" in v) {
      const { from, to } = v as { from: unknown; to: unknown };
      if (typeof from === "string") into.add(from);
      if (typeof to === "string") into.add(to);
    }
  };
  for (const e of entries) {
    if (e.actorId) people.add(e.actorId);
    collect(e.diff.ownerId, people);
    collect(e.diff.principalId, people);
    collect(e.diff.containerItemId, itemIds);
    collect(e.diff.locationId, locIds);
  }
  const ids = [...people];
  const userNames: Record<string, string> = {};
  const groupNames: Record<string, string> = {};
  if (ids.length) {
    for (const u of db
      .select({ id: users.id, n: users.displayName })
      .from(users)
      .where(inArray(users.id, ids))
      .all())
      userNames[u.id] = u.n;
    for (const g of db
      .select({ id: groups.id, n: groups.name })
      .from(groups)
      .where(inArray(groups.id, ids))
      .all())
      groupNames[g.id] = g.n;
  }
  const itemNames: Record<string, string> = {};
  const visible = visibleItemIds(db, ctx, [...itemIds]);
  if (visible.size)
    for (const r of db
      .select({ id: items.id, n: items.name })
      .from(items)
      .where(inArray(items.id, [...visible]))
      .all())
      itemNames[r.id] = r.n;
  const locNames: Record<string, string> = {};
  if (locIds.size) {
    const vis = visibleLocationIds(db, ctx);
    for (const l of db
      .select({ id: locations.id, n: locations.name })
      .from(locations)
      .where(inArray(locations.id, [...locIds]))
      .all())
      if (canSeeLocation(vis, l.id)) locNames[l.id] = l.n;
  }

  return {
    entries: entries.map(({ actorId, ...e }) => ({
      ...e,
      actor: actorId
        ? { id: actorId, name: userNames[actorId] ?? m.history_unknown_actor() }
        : null,
    })),
    nextCursor,
    names: { users: userNames, groups: groupNames, items: itemNames, locations: locNames },
  };
}
