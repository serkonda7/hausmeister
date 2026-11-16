import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { attachments, events, items, jobs } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { createJobRegistry, createJobWorker } from "../jobs/worker";
import { collectBlobIfUnreferenced, sweepOrphanBlobs } from "./gc";
import { addAttachmentJobs } from "./jobs";
import {
  coverPhotos,
  deleteAttachment,
  listItemAttachments,
  reorderAttachments,
  setAttachmentKind,
  setCoverPhoto,
  uploadAttachment,
} from "./service";
import type { BlobStore } from "./storage";
import { jpegWithGps, pdfBytes, pngBytes, seedWorld, tempStore } from "./test-helpers";

let db: AppDb;
let store: BlobStore;
let cleanup: () => void;
let u: ReturnType<typeof seedWorld>;

beforeEach(() => {
  db = createTestDb();
  ({ store, cleanup } = tempStore());
  u = seedWorld(db);
});
afterEach(() => cleanup());

const png = (color = "#336699") => pngBytes(32, 24, color);

async function outcome(fn: () => unknown): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (err) {
    const e = err as { status?: number; code?: string; message: string };
    return e.code ?? (e.status ? String(e.status) : e.message);
  }
}

function worker() {
  const registry = createJobRegistry();
  addAttachmentJobs(registry, () => store);
  return createJobWorker({ db, registry, log: () => {} });
}

describe("upload", () => {
  test("stores content-addressed, records the event, queues a thumbnail", async () => {
    const a = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "photo",
      fileName: "../../etc/Urlaub\u0000.jpg",
      bytes: await jpegWithGps(),
    });
    expect(a.mime).toBe("image/jpeg");
    expect(a.originalName).toBe("Urlaub.jpg");
    expect(a.sort).toBe(0);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(store.blobPath(a.sha256)).toContain(`/${a.sha256.slice(0, 2)}/${a.sha256.slice(2, 4)}/`);
    expect(existsSync(store.blobPath(a.sha256))).toBe(true);
    expect(a.bytes).toBe(Bun.file(store.blobPath(a.sha256)).size);

    const ev = db.select().from(events).where(eq(events.itemId, "A")).all();
    expect(ev.map((e) => [e.action, e.actorId, e.diff])).toEqual([
      ["attachment.added", "m1", { attachmentId: a.id, kind: "photo", originalName: "Urlaub.jpg" }],
    ]);
    const queued = db.select().from(jobs).all();
    expect(queued.map((j) => [j.kind, j.payload])).toEqual([
      ["attachments.thumbnail", { sha256: a.sha256 }],
    ]);
    expect(await worker().drain()).toBe(1);
    expect(store.hasThumb(a.sha256)).toBe(true);
  });

  test("next upload goes last; PDFs queue no thumbnail", async () => {
    await uploadAttachment(db, u.m1, store, { itemId: "A", kind: "photo", bytes: await png() });
    const b = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "receipt",
      bytes: pdfBytes(),
    });
    expect(b.sort).toBe(1);
    expect(db.select().from(jobs).all()).toHaveLength(1);
  });

  test("permission matrix: edit needed; invisible item is 404, visible below edit 403", async () => {
    const cases: [AuthCtx, string, string][] = [
      [u.admin, "A", "ok"],
      [u.m1, "A", "ok"],
      [u.m3, "A", "ok"], // edit grant
      [u.m2, "A", "403"], // view
      [u.g1, "A", "403"], // use
      [u.g2, "A", "404"],
      [u.m2, "H", "ok"], // household item: member edit
      [u.g1, "H", "404"],
      [u.m2, "P", "404"],
      [u.g1, "P", "404"],
      [u.admin, "P", "ok"],
      [u.m1, "missing", "404"],
    ];
    const bytes = await png();
    for (const [ctx, itemId, want] of cases) {
      const got = await outcome(() =>
        uploadAttachment(db, ctx, store, { itemId, kind: "photo", bytes }),
      );
      expect(`${ctx.userId}@${itemId}:${got}`).toBe(`${ctx.userId}@${itemId}:${want}`);
    }
  });
});

describe("dedup and deletion", () => {
  test("identical uploads share one file; it survives until the last row is gone", async () => {
    const bytes = await jpegWithGps();
    const a = await uploadAttachment(db, u.m1, store, { itemId: "A", kind: "photo", bytes });
    const b = await uploadAttachment(db, u.admin, store, { itemId: "H", kind: "photo", bytes });
    expect(b.sha256).toBe(a.sha256);
    await worker().drain();
    expect(store.hasThumb(a.sha256)).toBe(true);

    deleteAttachment(db, u.m1, a.id);
    await worker().drain();
    expect(store.hasBlob(a.sha256)).toBe(true); // b still uses it
    expect(store.hasThumb(a.sha256)).toBe(true);

    deleteAttachment(db, u.admin, b.id);
    expect(store.hasBlob(a.sha256)).toBe(true); // removed by the job, not inline
    await worker().drain();
    expect(store.hasBlob(a.sha256)).toBe(false);
    expect(store.hasThumb(a.sha256)).toBe(false);

    const ev = db.select().from(events).where(eq(events.action, "attachment.removed")).all();
    expect(ev.map((e) => [e.itemId, e.diff])).toEqual([
      ["A", { attachmentId: a.id, kind: "photo", originalName: null }],
      ["H", { attachmentId: b.id, kind: "photo", originalName: null }],
    ]);
  });

  test("a gc check never deletes a blob that is referenced", async () => {
    const a = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "photo",
      bytes: await png(),
    });
    expect(collectBlobIfUnreferenced(db, store, a.sha256)).toBe(false);
    expect(store.hasBlob(a.sha256)).toBe(true);
  });

  test("an upload whose blob was swept meanwhile writes it again", async () => {
    const bytes = await png();
    const a = await uploadAttachment(db, u.m1, store, { itemId: "A", kind: "photo", bytes });
    db.delete(attachments).run();
    collectBlobIfUnreferenced(db, store, a.sha256);
    const b = await uploadAttachment(db, u.m1, store, { itemId: "A", kind: "photo", bytes });
    expect(b.sha256).toBe(a.sha256);
    expect(store.hasBlob(b.sha256)).toBe(true);
  });

  test("item delete cascades rows; the sweep removes their files, temp leftovers and orphan thumbs", async () => {
    const shared = await png("#111111");
    const onA = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "photo",
      bytes: shared,
    });
    const onlyA = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "manual",
      bytes: pdfBytes(),
    });
    const onH = await uploadAttachment(db, u.m2, store, {
      itemId: "H",
      kind: "photo",
      bytes: shared,
    });
    await worker().drain();
    await Bun.write(`${store.tmpDir}/stale.tmp`, "x");

    db.delete(items).where(eq(items.id, "A")).run();
    expect(db.select().from(attachments).where(eq(attachments.itemId, "A")).all()).toHaveLength(0);

    // Inside the grace period nothing is touched.
    expect(sweepOrphanBlobs(db, store)).toEqual({ blobs: 0, thumbs: 0, tmp: 0 });
    const r = sweepOrphanBlobs(db, store, { now: Date.now() + 2 * 3_600_000 });
    expect(r).toEqual({ blobs: 1, thumbs: 0, tmp: 1 });
    expect(store.hasBlob(onlyA.sha256)).toBe(false);
    expect(store.hasBlob(onA.sha256)).toBe(true); // shared with H
    expect(store.hasBlob(onH.sha256)).toBe(true);
    expect(store.hasThumb(onH.sha256)).toBe(true);
  });
});

describe("list, kind, order, cover", () => {
  async function world() {
    const p1 = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "photo",
      bytes: await png("#100000"),
    });
    const r1 = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "receipt",
      bytes: pdfBytes(),
    });
    const p2 = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "photo",
      bytes: await png("#200000"),
    });
    const m1 = await uploadAttachment(db, u.m1, store, {
      itemId: "A",
      kind: "manual",
      bytes: pdfBytes("%m\n"),
    });
    return { p1, r1, p2, m1 };
  }

  test("list filters receipts below edit; invisible item is 404", async () => {
    const { p1, r1, p2, m1 } = await world();
    const ids = (ctx: AuthCtx) => listItemAttachments(db, ctx, "A").attachments.map((a) => a.id);
    expect(ids(u.m1)).toEqual([p1.id, r1.id, p2.id, m1.id]);
    expect(ids(u.m3)).toEqual([p1.id, r1.id, p2.id, m1.id]);
    expect(ids(u.m2)).toEqual([p1.id, p2.id, m1.id]);
    expect(ids(u.g1)).toEqual([p1.id, p2.id, m1.id]);
    expect(listItemAttachments(db, u.g1, "A").level).toBe("use");
    expect(await outcome(() => listItemAttachments(db, u.g2, "A"))).toBe("404");
  });

  test("delete / kind / reorder / cover: permission matrix", async () => {
    const { p1, r1, p2 } = await world();
    const ops: [string, (ctx: AuthCtx) => unknown][] = [
      ["kind", (ctx) => setAttachmentKind(db, ctx, { attachmentId: p2.id, kind: "other" })],
      ["kindReceipt", (ctx) => setAttachmentKind(db, ctx, { attachmentId: r1.id, kind: "other" })],
      ["reorder", (ctx) => reorderAttachments(db, ctx, { itemId: "A", order: [p1.id] })],
      ["cover", (ctx) => setCoverPhoto(db, ctx, p1.id)],
      ["deleteReceipt", (ctx) => deleteAttachment(db, ctx, r1.id)],
    ];
    const expected: Record<string, Record<string, string>> = {
      // photo on a visible item below edit: 403; receipt below edit: 404 (unreadable); invisible: 404
      m2: { kind: "403", kindReceipt: "404", reorder: "403", cover: "403", deleteReceipt: "404" },
      g1: { kind: "403", kindReceipt: "404", reorder: "403", cover: "403", deleteReceipt: "404" },
      g2: { kind: "404", kindReceipt: "404", reorder: "404", cover: "404", deleteReceipt: "404" },
    };
    for (const [who, want] of Object.entries(expected)) {
      for (const [name, op] of ops) {
        expect(`${who}:${name}:${await outcome(() => op(u[who as keyof typeof u]))}`).toBe(
          `${who}:${name}:${want[name]}`,
        );
      }
    }
    // Editors may do all of it (m3 has an edit grant); run the receipt delete last.
    for (const [name, op] of ops) {
      expect(`m3:${name}:${await outcome(() => op(u.m3))}`).toBe(`m3:${name}:ok`);
    }
    expect(await outcome(() => deleteAttachment(db, u.m1, "nope"))).toBe("404");
  });

  test("kind change moves a file in and out of the viewers' sight; PDFs cannot become photos", async () => {
    const { p1, r1 } = await world();
    setAttachmentKind(db, u.m1, { attachmentId: p1.id, kind: "receipt" });
    expect(listItemAttachments(db, u.m2, "A").attachments.map((a) => a.id)).not.toContain(p1.id);
    setAttachmentKind(db, u.m1, { attachmentId: p1.id, kind: "photo" });
    expect(listItemAttachments(db, u.m2, "A").attachments.map((a) => a.id)).toContain(p1.id);
    expect(
      await outcome(() => setAttachmentKind(db, u.m1, { attachmentId: r1.id, kind: "photo" })),
    ).toBe("ATTACHMENTS_KIND_MISMATCH");
  });

  test("reorder a subset keeps the others in place; invalid orders are refused", async () => {
    const { p1, r1, p2, m1 } = await world();
    const r = reorderAttachments(db, u.m1, { itemId: "A", order: [p2.id, p1.id] });
    expect(r.attachments.map((a) => a.id)).toEqual([p2.id, r1.id, p1.id, m1.id]);
    expect(r.attachments.map((a) => a.sort)).toEqual([0, 1, 2, 3]);
    expect(
      await outcome(() => reorderAttachments(db, u.m1, { itemId: "A", order: [p1.id, p1.id] })),
    ).toBe("ATTACHMENTS_ORDER_INVALID");
    const other = await uploadAttachment(db, u.m2, store, {
      itemId: "H",
      kind: "photo",
      bytes: await png(),
    });
    expect(
      await outcome(() => reorderAttachments(db, u.m1, { itemId: "A", order: [other.id] })),
    ).toBe("ATTACHMENTS_ORDER_INVALID");
  });

  test("cover is the first photo by sort", async () => {
    const { p1, p2, m1 } = await world();
    expect(coverPhotos(db, ["A", "H"]).get("A")).toBe(p1.id);
    setCoverPhoto(db, u.m1, p2.id);
    expect(coverPhotos(db, ["A"]).get("A")).toBe(p2.id);
    expect(coverPhotos(db, ["H"]).has("H")).toBe(false);
    expect(await outcome(() => setCoverPhoto(db, u.m1, m1.id))).toBe("ATTACHMENTS_NOT_PHOTO");
    const photo = db
      .select()
      .from(attachments)
      .where(and(eq(attachments.itemId, "A"), eq(attachments.kind, "photo")))
      .orderBy(attachments.sort)
      .all();
    expect(photo.map((p) => p.id)).toEqual([p2.id, p1.id]);
  });
});
