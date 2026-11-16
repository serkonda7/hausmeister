import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import sharp from "sharp";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { createTestDb } from "../db/test-db";
import { contentDisposition, parseRange, serveAttachment } from "./serve";
import { uploadAttachment } from "./service";
import type { BlobStore } from "./storage";
import { jpegWithGps, pdfBytes, seedWorld, tempStore } from "./test-helpers";
import { handleUploadRequest } from "./upload";

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

const get = (ctx: AuthCtx, id: string, query = "", headers: Record<string, string> = {}) =>
  serveAttachment(db, ctx, store, new Request(`http://x/files/${id}${query}`, { headers }), id);

async function fixtures() {
  const photoA = await uploadAttachment(db, u.m1, store, {
    itemId: "A",
    kind: "photo",
    fileName: "Fahrrad vorne ü.jpg",
    bytes: await jpegWithGps(),
  });
  const receiptA = await uploadAttachment(db, u.m1, store, {
    itemId: "A",
    kind: "receipt",
    fileName: "Rechnung.pdf",
    bytes: pdfBytes(),
  });
  const photoP = await uploadAttachment(db, u.m1, store, {
    itemId: "P",
    kind: "photo",
    bytes: await jpegWithGps(),
  });
  return { photoA, receiptA, photoP };
}

describe("GET /files/:id", () => {
  test("status for every role and level, including receipts below edit and invisible items", async () => {
    const { photoA, receiptA, photoP } = await fixtures();
    const want: [keyof typeof u, number, number, number][] = [
      // who, photo A, receipt A, photo on private P
      ["admin", 200, 200, 200],
      ["m1", 200, 200, 200], // owner (manage)
      ["m3", 200, 200, 404], // edit grant on A
      ["m2", 200, 404, 404], // view on A
      ["g1", 200, 404, 404], // use grant on A
      ["g2", 404, 404, 404], // nothing
    ];
    for (const [who, photo, receipt, priv] of want) {
      const got = [
        (await get(u[who], photoA.id)).status,
        (await get(u[who], receiptA.id)).status,
        (await get(u[who], photoP.id)).status,
      ];
      expect(`${who}:${got.join(",")}`).toBe(`${who}:${photo},${receipt},${priv}`);
    }
    // Missing id: byte-identical to an invisible one.
    const missing = await get(u.m2, "0198c0de-0000-7000-8000-000000000000");
    const hidden = await get(u.m2, receiptA.id);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(await hidden.text());
    expect([...missing.headers.entries()]).toEqual([...hidden.headers.entries()]);
  });

  test("headers: stored type, nosniff, sandbox CSP, safe disposition, private + ETag", async () => {
    const { photoA, receiptA } = await fixtures();
    const r = await get(u.m2, photoA.id);
    expect(r.headers.get("Content-Type")).toBe("image/jpeg");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(r.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(r.headers.get("Content-Disposition")).toBe(
      `inline; filename="Fahrrad vorne _.jpg"; filename*=UTF-8''Fahrrad%20vorne%20%C3%BC.jpg`,
    );
    expect(r.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(r.headers.get("ETag")).toBe(`"${photoA.sha256}"`);
    expect(r.headers.get("Content-Length")).toBe(String(photoA.bytes));
    // The served bytes carry no metadata.
    const meta = await sharp(new Uint8Array(await r.arrayBuffer())).metadata();
    expect(meta.exif).toBeUndefined();

    const pdf = await get(u.m1, receiptA.id, "?download=1");
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(pdf.headers.get("Content-Disposition")).toStartWith(
      'attachment; filename="Rechnung.pdf"',
    );
    expect(pdf.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  test("ETag revalidation answers 304, also for thumbnails", async () => {
    const { photoA } = await fixtures();
    const etag = (await get(u.m2, photoA.id)).headers.get("ETag")!;
    const again = await get(u.m2, photoA.id, "", { "If-None-Match": etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
    expect((await get(u.m2, photoA.id, "", { "If-None-Match": '"other"' })).status).toBe(200);

    const t = await get(u.m2, photoA.id, "?size=thumb");
    const tag = t.headers.get("ETag")!;
    expect(tag).toBe(`"${photoA.sha256}-t"`);
    expect((await get(u.m2, photoA.id, "?size=thumb", { "If-None-Match": tag })).status).toBe(304);
    // Revalidation still goes through authorization.
    expect((await get(u.g2, photoA.id, "", { "If-None-Match": etag })).status).toBe(404);
  });

  test("thumbnail is generated on demand before the job ran; PDFs have none", async () => {
    const { photoA, receiptA } = await fixtures();
    expect(store.hasThumb(photoA.sha256)).toBe(false);
    const t = await get(u.g1, photoA.id, "?size=thumb");
    expect(t.status).toBe(200);
    expect(t.headers.get("Content-Type")).toBe("image/webp");
    const meta = await sharp(new Uint8Array(await t.arrayBuffer())).metadata();
    expect(meta.format).toBe("webp");
    expect(store.hasThumb(photoA.sha256)).toBe(true);
    expect((await get(u.m1, receiptA.id, "?size=thumb")).status).toBe(404);
    expect((await get(u.m2, receiptA.id, "?size=thumb")).status).toBe(404);
  });

  test("byte ranges", async () => {
    const { receiptA } = await fixtures();
    const size = receiptA.bytes;
    const r = await get(u.m1, receiptA.id, "", { Range: "bytes=0-4" });
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe(`bytes 0-4/${size}`);
    expect(await r.text()).toBe("%PDF-");
    const tail = await get(u.m1, receiptA.id, "", { Range: "bytes=-6" });
    expect(await tail.text()).toBe("%%EOF\n");
    expect((await get(u.m1, receiptA.id, "", { Range: `bytes=${size}-` })).status).toBe(416);
    // If-Range with a different validator: whole file.
    const stale = await get(u.m1, receiptA.id, "", { Range: "bytes=0-4", "If-Range": '"old"' });
    expect(stale.status).toBe(200);
  });

  test("parseRange and contentDisposition edge cases", () => {
    expect(parseRange(null, 10)).toBeNull();
    expect(parseRange("bytes=2-", 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange("bytes=2-100", 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange("bytes=0-1,4-5", 10)).toBeNull();
    expect(parseRange("bytes=5-2", 10)).toBe("invalid");
    expect(parseRange("bytes=-0", 10)).toBe("invalid");
    expect(contentDisposition("inline", 'a"b\\c;d\r\n.pdf')).toBe(
      `inline; filename="a_b_c_d__.pdf"; filename*=UTF-8''a%22b%5Cc%3Bd%0D%0A.pdf`,
    );
  });
});

describe("POST /api/v1/items/:id/attachments", () => {
  function form(kind: string, bytes: Uint8Array, name: string, type: string) {
    const f = new FormData();
    f.set("kind", kind);
    f.set("file", new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
    return f;
  }
  const post = (ctx: AuthCtx, itemId: string, body: FormData | string, headers?: HeadersInit) =>
    handleUploadRequest(
      db,
      ctx,
      store,
      new Request(`http://x/api/v1/items/${itemId}/attachments`, { method: "POST", body, headers }),
      itemId,
    );

  test("type comes from content, not from the name or the client's Content-Type", async () => {
    const pdfAsJpeg = await post(u.m1, "A", form("photo", pdfBytes(), "photo.jpg", "image/jpeg"));
    expect(pdfAsJpeg.status).toBe(415);
    expect(await pdfAsJpeg.json()).toEqual({ error: "ATTACHMENTS_TYPE_REJECTED" });

    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const htmlAsPdf = await post(u.m1, "A", form("manual", html, "manual.pdf", "application/pdf"));
    expect(htmlAsPdf.status).toBe(415);

    const jpegAsTxt = await post(
      u.m1,
      "A",
      form("photo", await jpegWithGps(), "notes.txt", "text/plain"),
    );
    expect(jpegAsTxt.status).toBe(201);
    const { attachment } = (await jpegAsTxt.json()) as {
      attachment: { mime: string; originalName: string };
    };
    expect(attachment.mime).toBe("image/jpeg");
    expect(attachment.originalName).toBe("notes.txt");
  });

  test("oversize bodies are refused with 413 before parsing", async () => {
    const r = await post(u.m1, "A", "x", {
      "Content-Type": "multipart/form-data; boundary=x",
      "Content-Length": "30000000",
    });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ error: "ATTACHMENTS_TOO_LARGE" });
    const big = new Uint8Array(25_000_001);
    const r2 = await post(u.m1, "A", form("receipt", big, "big.pdf", "application/pdf"));
    expect(r2.status).toBe(413);
  });

  test("bad requests and permissions", async () => {
    expect((await post(u.m1, "A", form("selfie", pdfBytes(), "a.pdf", ""))).status).toBe(400);
    expect(
      (await post(u.m1, "A", "kind=photo", { "Content-Type": "application/x-www-form-urlencoded" }))
        .status,
    ).toBe(400);
    expect((await post(u.m2, "A", form("photo", await jpegWithGps(), "a.jpg", ""))).status).toBe(
      403,
    );
    expect((await post(u.m2, "P", form("photo", await jpegWithGps(), "a.jpg", ""))).status).toBe(
      404,
    );
    expect((await post(u.g2, "A", form("photo", await jpegWithGps(), "a.jpg", ""))).status).toBe(
      404,
    );
  });
});
