// The one place an item turns into what leaves the server (DESIGN §3.4,
// implementation rules). Below `edit`, `priceCents` and `currency` are ABSENT
// from the output (not null) and receipt attachments are dropped.
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { type Attachment, attachments, type Item } from "../db/schema";
import type { AuthCtx } from "./ctx";
import { canSeeMoney, type ItemAuthFields, type Level, type VisibleLevel } from "./levels";
import { type LeveledItem, loadItemForCtx, withLevels } from "./load";

type MoneyKey = "priceCents" | "currency";
type Reserved = "level" | "attachments";

/** Attachment metadata as sent to the client. */
export type SerializedAttachment = Attachment;

/**
 * An item as sent to the client. Discriminated by `level`: only the `edit` and
 * `manage` variants carry `priceCents` / `currency`. A raw row has no `level`,
 * so it does not type-check where a SerializedItem is expected.
 * `attachments` is present only when attachments were passed to serializeItem.
 */
export type SerializedItem<T extends { id: string } = Item> = (
  | (Omit<T, MoneyKey | Reserved> & {
      level: "view" | "use";
      priceCents?: never;
      currency?: never;
    })
  | (Omit<T, Reserved> & { level: "edit" | "manage" })
) & { attachments?: SerializedAttachment[] };

/** True when an attachment of this kind may be shown or downloaded at this level. */
export function canReadAttachment(level: Level, attachment: Pick<Attachment, "kind">): boolean {
  if (level === "none") return false;
  return attachment.kind !== "receipt" || canSeeMoney(level);
}

/** The attachments the caller may see at this level (receipts only from `edit`). */
export function filterAttachments<A extends Pick<Attachment, "kind">>(
  list: readonly A[],
  level: Level,
): A[] {
  return list.filter((a) => canReadAttachment(level, a));
}

/**
 * Serializes one item for a caller with `level` (from loadItemForCtx /
 * itemLevels / withLevels; never make one up). Throws on `none`: an item the
 * caller cannot see must never reach serialization. Attachments that belong to
 * other items are dropped.
 */
export function serializeItem<T extends { id: string }>(
  item: T,
  level: Level,
  opts: { attachments?: readonly SerializedAttachment[] } = {},
): SerializedItem<T> {
  if (level === "none") throw new Error("serializeItem: item is not visible to the caller");
  const {
    priceCents,
    currency,
    level: _l,
    attachments: _a,
    ...rest
  } = item as T & {
    priceCents?: unknown;
    currency?: unknown;
    level?: unknown;
    attachments?: unknown;
  };
  const out: Record<string, unknown> = { ...rest, level };
  if (canSeeMoney(level)) {
    if ("priceCents" in item) out.priceCents = priceCents;
    if ("currency" in item) out.currency = currency;
  }
  if (opts.attachments) {
    out.attachments = filterAttachments(
      opts.attachments.filter((a) => a.itemId === item.id),
      level,
    );
  }
  return out as SerializedItem<T>;
}

/** Serializes a LeveledItem (what loadItemForCtx / withLevels return). */
export function serializeLeveled<T extends { id: string }>(
  { item, level }: LeveledItem<T>,
  opts: { attachments?: readonly SerializedAttachment[] } = {},
): SerializedItem<T> {
  return serializeItem(item, level, opts);
}

/**
 * Lists: computes the levels of a page of rows (one grants query) and
 * serializes them. The rows must come from a query that ANDed
 * `visibleItemsWhere(ctx)`; rows below view are dropped as a safety net.
 */
export function serializeItemsForCtx<T extends ItemAuthFields>(
  db: AppDb,
  ctx: AuthCtx,
  rows: readonly T[],
): SerializedItem<T>[] {
  return withLevels(db, ctx, rows).map(({ item, level }) => serializeItem(item, level));
}

export type ReadableAttachment = {
  attachment: Attachment;
  item: Item;
  level: VisibleLevel;
};

/**
 * For the /files/:id route: loads an attachment the caller may read, or null
 * when the attachment does not exist, its item is invisible, or it is a
 * receipt and the caller's level is below edit. Answer null with 404.
 */
export function loadAttachmentForCtx(
  db: AppDb,
  ctx: AuthCtx,
  attachmentId: string,
): ReadableAttachment | null {
  const attachment = db.select().from(attachments).where(eq(attachments.id, attachmentId)).get();
  if (!attachment) return null;
  const found = loadItemForCtx(db, ctx, attachment.itemId);
  if (!found || !canReadAttachment(found.level, attachment)) return null;
  return { attachment, item: found.item, level: found.level };
}
