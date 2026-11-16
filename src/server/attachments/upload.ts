// POST /api/v1/items/:itemId/attachments (multipart/form-data: `file`, `kind`).
// One file per request, so the uploader can show progress and retry per file.
// The body is read with a hard byte limit before parsing, so an oversize or
// lying Content-Length cannot make the server buffer more than MAX_BODY_BYTES.
import { z } from "zod";
import { ATTACHMENT_KINDS, MAX_BODY_BYTES } from "../../lib/attachments/rules";
import { HttpError, httpErrorResponse } from "../auth/context";
import type { AuthCtx } from "../authz/ctx";
import { requireItemForCtx } from "../authz/load";
import type { AppDb } from "../db/client";
import { AttachmentError } from "./errors";
import { uploadAttachment } from "./service";
import type { BlobStore } from "./storage";

const kindSchema = z.enum(ATTACHMENT_KINDS);

export function attachmentErrorResponse(err: AttachmentError): Response {
  return Response.json({ error: err.code }, { status: err.status });
}

class TooLarge extends Error {}

async function readLimited(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get("Content-Length") ?? "NaN");
  if (Number.isFinite(declared) && declared > limit) throw new TooLarge();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new TooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

export async function handleUploadRequest(
  db: AppDb,
  ctx: AuthCtx,
  store: BlobStore,
  request: Request,
  itemId: string,
): Promise<Response> {
  try {
    // Permission first: no need to read 25 MB for a caller who may not upload.
    requireItemForCtx(db, ctx, itemId, "edit");
    const type = request.headers.get("Content-Type") ?? "";
    if (!type.toLowerCase().startsWith("multipart/form-data")) {
      throw new AttachmentError(400, "ATTACHMENTS_BAD_REQUEST");
    }
    let body: Uint8Array<ArrayBuffer>;
    try {
      body = await readLimited(request, MAX_BODY_BYTES);
    } catch (err) {
      if (err instanceof TooLarge) throw new AttachmentError(413, "ATTACHMENTS_TOO_LARGE");
      throw err;
    }
    let form: FormData;
    try {
      form = await new Response(body, { headers: { "Content-Type": type } }).formData();
    } catch {
      throw new AttachmentError(400, "ATTACHMENTS_BAD_REQUEST");
    }
    const kind = kindSchema.safeParse(form.get("kind"));
    const file = form.get("file");
    if (!kind.success || !(file instanceof Blob)) {
      throw new AttachmentError(400, "ATTACHMENTS_BAD_REQUEST");
    }
    // The client's file name is kept for display only; its Content-Type is ignored.
    const attachment = await uploadAttachment(db, ctx, store, {
      itemId,
      kind: kind.data,
      fileName: file instanceof File ? file.name : null,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json({ attachment }, { status: 201 });
  } catch (err) {
    if (err instanceof AttachmentError) return attachmentErrorResponse(err);
    if (err instanceof HttpError) return httpErrorResponse(err);
    throw err;
  }
}
