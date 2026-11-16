// Test-only fixtures for attachment tests: a temp blob store, a seeded
// permission world, and generated image/PDF bytes.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import type { AuthCtx } from "../authz/ctx";
import { seed } from "../authz/test-fixtures";
import type { AppDb } from "../db/client";
import { createBlobStore } from "./storage";

export function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), "hm-uploads-"));
  const store = createBlobStore(dir);
  return { store, dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const ctxOf = (userId: string, role: AuthCtx["role"]): AuthCtx => ({
  userId,
  role,
  groupIds: new Set(),
});

/**
 * Users and items covering every level:
 *  item "A": owned by m1, household-visible. m1 manage, m3 edit (grant),
 *            m2 view, g1 use (grant), g2 none, admin manage.
 *  item "H": household-owned: m2 edit.
 *  item "P": owned by m1, private: m2 / g1 / g2 none.
 */
export function seedWorld(db: AppDb) {
  seed(db, {
    users: [
      { id: "admin", role: "admin" },
      { id: "m1", role: "member" },
      { id: "m2", role: "member" },
      { id: "m3", role: "member" },
      { id: "g1", role: "guest" },
      { id: "g2", role: "guest" },
    ],
    items: [
      { id: "A", ownerKind: "user", ownerId: "m1", visibility: "household" },
      { id: "H", ownerKind: "household", ownerId: null },
      { id: "P", ownerKind: "user", ownerId: "m1", visibility: "private" },
    ],
    grants: [
      { itemId: "A", principalKind: "user", principalId: "m3", level: "edit" },
      { itemId: "A", principalKind: "user", principalId: "g1", level: "use" },
    ],
  });
  return {
    admin: ctxOf("admin", "admin"),
    m1: ctxOf("m1", "member"),
    m2: ctxOf("m2", "member"),
    m3: ctxOf("m3", "member"),
    g1: ctxOf("g1", "guest"),
    g2: ctxOf("g2", "guest"),
  };
}

const toU8 = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

/** 40x20 JPEG, left half red, right half blue, EXIF orientation 6 (display rotated 90° CW), GPS + camera make. */
export async function jpegWithGps(): Promise<Uint8Array> {
  const red = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#ff0000" } })
    .png()
    .toBuffer();
  const out = await sharp({ create: { width: 40, height: 20, channels: 3, background: "#0000ff" } })
    .composite([{ input: red, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Make: "TestCam", Model: "Leaky 1" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "52/1 31/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "13/1 24/1 0/1",
      },
    })
    .toBuffer();
  return toU8(out);
}

export async function pngBytes(width = 32, height = 24, background = "#336699") {
  return toU8(
    await sharp({ create: { width, height, channels: 3, background } })
      .png()
      .toBuffer(),
  );
}

export async function webpBytes() {
  return toU8(
    await sharp({ create: { width: 16, height: 16, channels: 4, background: "#00ff0080" } })
      .webp()
      .toBuffer(),
  );
}

export const pdfBytes = (extra = "") =>
  new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n${extra}trailer << /Root 1 0 R >>\n%%EOF\n`,
  );

/** A HEIC container header (ftyp heic) with an HEVC payload sharp's build cannot decode. */
export function fakeHeic(): Uint8Array {
  const b = new Uint8Array(64);
  const ftyp = [0, 0, 0, 24, ..."ftypheic".split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 0];
  b.set(ftyp, 0);
  b.set(
    [..."mif1heic"].map((c) => c.charCodeAt(0)),
    16,
  );
  return b;
}
