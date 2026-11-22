// Server functions for attachments. Logic and permission checks live in
// ./service.ts; these add auth and input validation. The upload itself is the
// multipart route POST /api/v1/items/:itemId/attachments (./upload.ts).
import { createServerFn } from "@tanstack/solid-start";
import { z } from "zod";
import { ATTACHMENT_KINDS } from "../../lib/attachments/rules";
import { authMiddleware } from "../auth/middleware";
import { getDb } from "../db/client";
import {
  deleteAttachment,
  listItemAttachments,
  reorderAttachments,
  setAttachmentKind,
  setCoverPhoto,
} from "./service";

const id = z.string().min(1).max(64);

/** { level, attachments } for the item (receipts only from `edit`). */
export const listAttachmentsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ itemId: id }))
  .handler(({ context: { ctx }, data }) => listItemAttachments(getDb(), ctx, data.itemId));

export const deleteAttachmentFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ attachmentId: id }))
  .handler(({ context: { ctx }, data }) => deleteAttachment(getDb(), ctx, data.attachmentId));

export const setAttachmentKindFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ attachmentId: id, kind: z.enum(ATTACHMENT_KINDS) }))
  .handler(({ context: { ctx }, data }) => setAttachmentKind(getDb(), ctx, data));

export const reorderAttachmentsFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ itemId: id, order: z.array(id).min(1).max(500) }))
  .handler(({ context: { ctx }, data }) => reorderAttachments(getDb(), ctx, data));

export const setCoverPhotoFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ attachmentId: id }))
  .handler(({ context: { ctx }, data }) => setCoverPhoto(getDb(), ctx, data.attachmentId));
