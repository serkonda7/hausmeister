import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { MAX_FILE_BYTES } from "../../lib/attachments/rules";
import { AttachmentError } from "./errors";
import { makeThumbnail, prepareUpload } from "./process";
import { fakeHeic, jpegWithGps, pdfBytes, pngBytes, webpBytes } from "./test-helpers";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "accepted";
  } catch (err) {
    if (err instanceof AttachmentError) return err.code;
    throw err;
  }
}

const enc = (s: string) => new TextEncoder().encode(s);

describe("prepareUpload: type decided by content", () => {
  test("photo with GPS EXIF and orientation comes out upright with no metadata at all", async () => {
    const input = await jpegWithGps();
    const inMeta = await sharp(input).metadata();
    // The fixture really carries what must go: orientation, camera make, GPS IFD pointer (0x8825).
    expect(inMeta.orientation).toBe(6);
    expect(inMeta.exif?.includes(Buffer.from("TestCam"))).toBe(true);
    expect(inMeta.exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true);

    const out = await prepareUpload("photo", input);
    expect(out.mime).toBe("image/jpeg");
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([20, 40]); // rotated into place
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(Buffer.from(out.data).includes(Buffer.from("TestCam"))).toBe(false);
    // Orientation 6 shows the stored left (red) half on top.
    const { data, info } = await sharp(out.data).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [
      ...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3),
    ];
    const [rTop, , bTop] = px(10, 5);
    const [rBottom, , bBottom] = px(10, 35);
    expect(rTop!).toBeGreaterThan(200);
    expect(bTop!).toBeLessThan(60);
    expect(bBottom!).toBeGreaterThan(200);
    expect(rBottom!).toBeLessThan(60);
  });

  test("identical uploads produce identical stored bytes (dedup works)", async () => {
    const input = await jpegWithGps();
    const a = await prepareUpload("photo", input);
    const b = await prepareUpload("photo", input);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  test("PNG and WebP keep their format; PDF is stored byte for byte", async () => {
    expect((await prepareUpload("photo", await pngBytes())).mime).toBe("image/png");
    expect((await prepareUpload("photo", await webpBytes())).mime).toBe("image/webp");
    const pdf = pdfBytes();
    const out = await prepareUpload("receipt", pdf);
    expect(out.mime).toBe("application/pdf");
    expect(out.data).toEqual(pdf);
  });

  test("images are accepted for every kind, PDFs for all but photos", async () => {
    for (const kind of ["photo", "receipt", "manual", "other"] as const) {
      expect(await code(prepareUpload(kind, await pngBytes()))).toBe("accepted");
    }
    expect(await code(prepareUpload("photo", pdfBytes()))).toBe("ATTACHMENTS_TYPE_REJECTED");
    for (const kind of ["receipt", "manual", "other"] as const) {
      expect(await code(prepareUpload(kind, pdfBytes()))).toBe("accepted");
    }
  });

  test("everything without a known signature is rejected", async () => {
    const rejected = [
      enc("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
      enc("<!doctype html><script>alert(1)</script>"),
      enc("PK\x03\x04 zip archive"),
      enc("plain text that claims to be photo.jpg"),
      enc("MZ\x90\x00 windows exe"),
      new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]), // .ico
      enc("II*\x00 tiff"), // TIFF: sharp decodes it, but it is not on the allow-list
    ];
    for (const bytes of rejected) {
      expect(await code(prepareUpload("other", bytes))).toBe("ATTACHMENTS_TYPE_REJECTED");
    }
  });

  test("a JPEG signature on garbage, or a PNG that sharp parses as something else, is invalid", async () => {
    const fake = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...enc("not really a jpeg at all")]);
    expect(await code(prepareUpload("photo", fake))).toBe("ATTACHMENTS_IMAGE_INVALID");
    const truncated = (await pngBytes(200, 200)).slice(0, 60);
    expect(await code(prepareUpload("photo", truncated))).toBe("ATTACHMENTS_IMAGE_INVALID");
  });

  test("HEIC that the bundled libheif cannot decode gets its own error", async () => {
    expect(await code(prepareUpload("photo", fakeHeic()))).toBe("ATTACHMENTS_HEIC_UNSUPPORTED");
  });

  test("AVIF is converted to JPEG", async () => {
    const avif = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "#123456" },
    })
      .avif()
      .toBuffer();
    const out = await prepareUpload("photo", new Uint8Array(avif));
    expect(out.mime).toBe("image/jpeg");
  });

  test("empty, oversize and decompression bombs are refused", async () => {
    expect(await code(prepareUpload("photo", new Uint8Array()))).toBe("ATTACHMENTS_EMPTY");
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff], 0);
    expect(await code(prepareUpload("photo", big))).toBe("ATTACHMENTS_TOO_LARGE");
    // 10000 x 7000 single-colour PNG: tiny file, 70 MP once decoded.
    const bomb = await sharp({
      create: { width: 10_000, height: 7_000, channels: 3, background: "#fff" },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.byteLength).toBeLessThan(1_000_000);
    expect(await code(prepareUpload("photo", new Uint8Array(bomb)))).toBe(
      "ATTACHMENTS_IMAGE_TOO_LARGE",
    );
  });

  test("large photos are scaled to fit 4096 px", async () => {
    const wide = await sharp({
      create: { width: 5000, height: 1000, channels: 3, background: "#abc" },
    })
      .jpeg()
      .toBuffer();
    const out = await prepareUpload("photo", new Uint8Array(wide));
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([4096, 819]);
  });

  test("thumbnails are WebP within 512 px", async () => {
    const stored = await prepareUpload(
      "photo",
      new Uint8Array(
        await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#f80" } })
          .jpeg()
          .toBuffer(),
      ),
    );
    const meta = await sharp(await makeThumbnail(stored.data)).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([512, 341]);
  });
});
