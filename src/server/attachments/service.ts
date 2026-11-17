// Attachments of an item: upload, list, delete, reorder, change kind, cover.
// Testable without a request: every function takes db and ctx (and the blob
// store where files are touched). Server functions (./functions.ts) and the
// upload route (src/routes/api/v1/items/$itemId.attachments.ts) wrap these.
//
// Levels: listing needs `view` (receipts filtered below `edit`, §3.4); every
// change needs `edit` (§3.2: edit changes photos and sees receipts). An item
// the caller cannot see, and a receipt the caller cannot read, answer 404;
// a visible item below `edit` answers 403.
import { and, asc, eq, sql } from "drizzle-orm";
import {
  ACCEPTED_MIMES,
  type AttachmentKind,
  cleanFileName,
  isImageMime,
} from "../../lib/attachments/rules";
import type { SniffedMime } from "../../lib/mime-sniff";
import { recordEvent } from "../audit";
import { HttpError } from "../auth/context";
import type { AuthCtx } from "../authz/ctx";
import { atLeast, type VisibleLevel } from "../authz/levels";
import { loadItemForCtx, requireItemForCtx } from "../authz/load";
import {
  canReadAttachment,
  filterAttachments,
  type SerializedAttachment,
} from "../authz/serialize";
import type { AppDb, DbOrTx } from "../db/client";
import { type Attachment, attachments } from "../db/schema";
import { enqueueJob } from "../jobs/queue";
import { kickJobWorker } from "../jobs/worker";
import { AttachmentError } from "./errors";
import { enqueueBlobGc, THUMB_JOB } from "./gc";
import { prepareUpload } from "./process";
import type { BlobStore } from "./storage";

export type ItemAttachments = { level: VisibleLevel; attachments: SerializedAttachment[] };

function itemAttachmentRows(db: DbOrTx, itemId: string): Attachment[] {
  return db
    .select()
    .from(attachments)
    .where(eq(attachments.itemId, itemId))
    .orderBy(asc(attachments.sort), asc(attachments.createdAt), asc(attachments.id))
    .all();
}

/** The item's attachments the caller may see, in display order (404 when the item is invisible). */
export function listItemAttachments(db: AppDb, ctx: AuthCtx, itemId: string): ItemAttachments {
  const found = loadItemForCtx(db, ctx, itemId);
  if (!found) throw new HttpError(404, "NOT_FOUND");
  return {
    level: found.level,
    attachments: filterAttachments(itemAttachmentRows(db, itemId), found.level),
  };
}

/**
 * Loads an attachment for a change: 404 when it does not exist, its item is
 * invisible or it is a receipt the caller cannot read; 403 below `edit`.
 */
function requireAttachmentForEdit(db: AppDb, ctx: AuthCtx, attachmentId: string) {
  const attachment = db.select().from(attachments).where(eq(attachments.id, attachmentId)).get();
  if (!attachment) throw new HttpError(404, "NOT_FOUND");
  const found = loadItemForCtx(db, ctx, attachment.itemId);
  if (!found || !canReadAttachment(found.level, attachment)) throw new HttpError(404, "NOT_FOUND");
  if (!atLeast(found.level, "edit")) throw new HttpError(403, "FORBIDDEN");
  return { attachment, level: found.level };
}

export type UploadInput = {
  itemId: string;
  kind: AttachmentKind;
  fileName?: string | null;
  bytes: Uint8Array;
};

/**
 * Validates, sanitizes and stores one file, then inserts its row (last in
 * sort order), writes `attachment.added` and queues the thumbnail.
 * Inline: type check, image re-encode (rotate + strip metadata; it must happen
 * before anything touches disk) and the atomic write. Queued: the thumbnail.
 */
export async function uploadAttachment(
  db: AppDb,
  ctx: AuthCtx,
  store: BlobStore,
  input: UploadInput,
): Promise<SerializedAttachment> {
  requireItemForCtx(db, ctx, input.itemId, "edit");
  const prepared = await prepareUpload(input.kind, input.bytes);
  const { sha256 } = await store.put(prepared.data);

  // From here on synchronous: the level is checked again (it may have changed
  // while sharp ran), and blob + row are made consistent in one tick (gc.ts).
  requireItemForCtx(db, ctx, input.itemId, "edit");
  store.ensureBlobSync(sha256, prepared.data);
  const originalName = cleanFileName(input.fileName);
  const row = db.transaction((tx) => {
    const { next } = tx
      .select({ next: sql<number>`coalesce(max(${attachments.sort}), -1) + 1` })
      .from(attachments)
      .where(eq(attachments.itemId, input.itemId))
      .get()!;
    const inserted = tx
      .insert(attachments)
      .values({
        itemId: input.itemId,
        kind: input.kind,
        sha256,
        mime: prepared.mime,
        bytes: prepared.data.byteLength,
        originalName,
        sort: next,
        createdBy: ctx.userId,
      })
      .returning()
      .get();
    recordEvent(tx, {
      actorId: ctx.userId,
      action: "attachment.added",
      itemId: input.itemId,
      diff: { attachmentId: inserted.id, kind: inserted.kind, originalName },
    });
    if (isImageMime(prepared.mime) && !store.hasThumb(sha256)) {
      enqueueJob(tx, THUMB_JOB, { sha256 });
    }
    return inserted;
  });
  kickJobWorker();
  return row;
}

/** Deletes the row, writes `attachment.removed`, and queues the blob's reference check. */
export function deleteAttachment(db: AppDb, ctx: AuthCtx, attachmentId: string): { ok: true } {
  const { attachment } = requireAttachmentForEdit(db, ctx, attachmentId);
  db.transaction((tx) => {
    tx.delete(attachments).where(eq(attachments.id, attachment.id)).run();
    recordEvent(tx, {
      actorId: ctx.userId,
      action: "attachment.removed",
      itemId: attachment.itemId,
      diff: {
        attachmentId: attachment.id,
        kind: attachment.kind,
        originalName: attachment.originalName,
      },
    });
    enqueueBlobGc(tx, [attachment.sha256]);
  });
  kickJobWorker();
  return { ok: true };
}

/**
 * Changes the kind; needs `edit`, also to or from `receipt` (an editor could
 * re-upload a receipt as a photo anyway, so `manage` would protect nothing).
 * The new kind must accept the stored type (a PDF cannot become a photo).
 */
export function setAttachmentKind(
  db: AppDb,
  ctx: AuthCtx,
  input: { attachmentId: string; kind: AttachmentKind },
): SerializedAttachment {
  const { attachment } = requireAttachmentForEdit(db, ctx, input.attachmentId);
  if (!ACCEPTED_MIMES[input.kind].includes(attachment.mime as SniffedMime)) {
    throw new AttachmentError(422, "ATTACHMENTS_KIND_MISMATCH");
  }
  if (attachment.kind === input.kind) return attachment;
  // The event matters for redaction: once an attachment was a receipt, every
  // event about it is hidden below `edit` (history service, redactEvent).
  return db.transaction((tx) => {
    const row = tx
      .update(attachments)
      .set({ kind: input.kind })
      .where(eq(attachments.id, attachment.id))
      .returning()
      .get()!;
    recordEvent(tx, {
      actorId: ctx.userId,
      action: "attachment.kind_changed",
      itemId: attachment.itemId,
      diff: {
        attachmentId: attachment.id,
        kind: { from: attachment.kind, to: input.kind },
        originalName: attachment.originalName,
      },
    });
    return row;
  });
}

/**
 * Reorders some or all of an item's attachments: the given ids take the sort
 * slots they occupy together, in the given order; the rest keep their place.
 * (The gallery passes only the photos; the cover is the first photo.)
 */
export function reorderAttachments(
  db: AppDb,
  ctx: AuthCtx,
  input: { itemId: string; order: string[] },
): ItemAttachments {
  const found = requireItemForCtx(db, ctx, input.itemId, "edit");
  db.transaction((tx) => {
    const rows = itemAttachmentRows(tx, input.itemId);
    const ids = new Set(rows.map((r) => r.id));
    const wanted = new Set(input.order);
    if (wanted.size !== input.order.length || input.order.some((id) => !ids.has(id))) {
      throw new AttachmentError(422, "ATTACHMENTS_ORDER_INVALID");
    }
    const queue = [...input.order];
    const next = rows.map((r) => (wanted.has(r.id) ? queue.shift()! : r.id));
    next.forEach((id, i) => {
      tx.update(attachments)
        .set({ sort: i })
        .where(and(eq(attachments.id, id), eq(attachments.itemId, input.itemId)))
        .run();
    });
  });
  return {
    level: found.level,
    attachments: filterAttachments(itemAttachmentRows(db, input.itemId), found.level),
  };
}

/** Makes a photo the cover: first among the item's photos. */
export function setCoverPhoto(db: AppDb, ctx: AuthCtx, attachmentId: string): ItemAttachments {
  const { attachment } = requireAttachmentForEdit(db, ctx, attachmentId);
  if (attachment.kind !== "photo") throw new AttachmentError(422, "ATTACHMENTS_NOT_PHOTO");
  const photos = itemAttachmentRows(db, attachment.itemId)
    .filter((a) => a.kind === "photo")
    .map((a) => a.id);
  return reorderAttachments(db, ctx, {
    itemId: attachment.itemId,
    order: [attachment.id, ...photos.filter((id) => id !== attachment.id)],
  });
}

/** Cover photo of each item (first photo by sort), for lists. Photos are visible from `view`. */
export function coverPhotos(db: DbOrTx, itemIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (itemIds.length === 0) return out;
  const rows = db
    .select({ itemId: attachments.itemId, id: attachments.id })
    .from(attachments)
    .where(
      and(
        eq(attachments.kind, "photo"),
        sql`${attachments.itemId} IN (SELECT value FROM json_each(${JSON.stringify(itemIds)}))`,
      ),
    )
    .orderBy(asc(attachments.itemId), asc(attachments.sort), asc(attachments.createdAt))
    .all();
  for (const r of rows) if (!out.has(r.itemId)) out.set(r.itemId, r.id);
  return out;
}
