// Attachment rules shared by the server (enforcement) and the uploader UI
// (early, friendlier checks). The server never trusts the client's checks:
// file types are decided by magic bytes on the server (src/lib/mime-sniff.ts).
import type { SniffedMime } from "../mime-sniff";

/** Same list as ATTACHMENT_KINDS in src/server/db/schema.ts (kept apart so the client bundle stays free of Drizzle). */
export const ATTACHMENT_KINDS = ["photo", "receipt", "manual", "other"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
] as const satisfies readonly SniffedMime[];

const DOCUMENT_MIMES = [...IMAGE_MIMES, "application/pdf"] as const;

/** Which sniffed types each kind accepts. Everything else is rejected. */
export const ACCEPTED_MIMES: Record<AttachmentKind, readonly SniffedMime[]> = {
  photo: IMAGE_MIMES,
  receipt: DOCUMENT_MIMES,
  manual: DOCUMENT_MIMES,
  other: DOCUMENT_MIMES,
};

/** For <input accept>: a hint only, the server decides by content. */
export const ACCEPT_ATTR: Record<AttachmentKind, string> = {
  photo: "image/*,.heic,.heif",
  receipt: "image/*,.heic,.heif,application/pdf,.pdf",
  manual: "image/*,.heic,.heif,application/pdf,.pdf",
  other: "image/*,.heic,.heif,application/pdf,.pdf",
};

/**
 * Caddy caps request bodies at 25 MB (= 25,000,000 bytes, DESIGN §8.2). One
 * file per request, so the file limit leaves room for the multipart framing.
 */
export const MAX_BODY_BYTES = 25_000_000;
export const MAX_FILE_BYTES = 24_000_000;

/** Decoded image size limit (decompression bombs): 60 MP, e.g. 9000 x 6666. */
export const MAX_INPUT_PIXELS = 60_000_000;
/** Stored images are scaled down to fit this box (long edge, px). */
export const MAX_STORED_EDGE = 4096;
/** Thumbnails fit this box (WebP). */
export const THUMB_EDGE = 512;

/** Client-side downscaling of camera photos before upload (see uploader). */
export const CLIENT_MAX_EDGE = 2560;
export const CLIENT_JPEG_QUALITY = 0.85;

export const isImageMime = (mime: string) => (IMAGE_MIMES as readonly string[]).includes(mime);

/** URL of an attachment (or its WebP thumbnail). Served by src/routes/files.$attachmentId.ts. */
export const fileUrl = (attachmentId: string, size?: "thumb") =>
  `/files/${encodeURIComponent(attachmentId)}${size ? `?size=${size}` : ""}`;

export const uploadUrl = (itemId: string) =>
  `/api/v1/items/${encodeURIComponent(itemId)}/attachments`;

/**
 * Error codes of the attachment API (HTTP JSON `{ error }` and server-function
 * error messages). The UI maps them to German in components/attachments/errors.ts.
 */
export const ATTACHMENT_ERRORS = [
  "ATTACHMENTS_TOO_LARGE",
  "ATTACHMENTS_EMPTY",
  "ATTACHMENTS_TYPE_REJECTED",
  "ATTACHMENTS_HEIC_UNSUPPORTED",
  "ATTACHMENTS_IMAGE_TOO_LARGE",
  "ATTACHMENTS_IMAGE_INVALID",
  "ATTACHMENTS_KIND_MISMATCH",
  "ATTACHMENTS_BAD_REQUEST",
  "ATTACHMENTS_ORDER_INVALID",
  "ATTACHMENTS_NOT_PHOTO",
] as const;
export type AttachmentErrorCode = (typeof ATTACHMENT_ERRORS)[number];

/** Strips paths, control characters and odd whitespace from a client file name. */
export function cleanFileName(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return cleaned.slice(0, 200);
}
