import { describe, expect, it } from "bun:test";
import { sniffMime } from "./mime-sniff";

const encoder = new TextEncoder();

function ascii(text: string): Uint8Array {
  return encoder.encode(text);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function isoFtyp(brand: string): Uint8Array {
  return concat(new Uint8Array(4), ascii("ftyp"), ascii(brand));
}

describe("sniffMime", () => {
  it("detects JPEG from FF D8 FF", () => {
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toBe("image/jpeg");
  });

  it("detects PNG from its eight-byte signature", () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      "image/png",
    );
  });

  it("detects both GIF versions", () => {
    expect(sniffMime(ascii("GIF87a89a"))).toBe("image/gif");
    expect(sniffMime(ascii("GIF89a"))).toBe("image/gif");
  });

  it("detects WebP via RIFF at 0 and WEBP at 8", () => {
    expect(
      sniffMime(concat(ascii("RIFF"), new Uint8Array([0x24, 0, 0, 0]), ascii("WEBPVP8 "))),
    ).toBe("image/webp");
  });

  it("rejects other RIFF formats", () => {
    expect(
      sniffMime(concat(ascii("RIFF"), new Uint8Array([1, 2, 3, 4]), ascii("WAVEfmt "))),
    ).toBeNull();
  });

  it("detects PDF from %PDF-", () => {
    expect(sniffMime(ascii("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("detects HEIC brands", () => {
    for (const brand of ["heic", "heix", "hevc", "hevx", "mif1", "msf1"]) {
      expect(sniffMime(isoFtyp(brand))).toBe("image/heic");
    }
  });

  it("detects AVIF brands", () => {
    for (const brand of ["avif", "avis"]) {
      expect(sniffMime(isoFtyp(brand))).toBe("image/avif");
    }
  });

  it("rejects unknown ISO-BMFF brands", () => {
    expect(sniffMime(isoFtyp("mp42"))).toBeNull();
  });

  it("returns null for empty, too-short and unknown input", () => {
    expect(sniffMime(new Uint8Array(0))).toBeNull();
    expect(sniffMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffMime(ascii("just a text file"))).toBeNull();
    expect(sniffMime(ascii("RIFF"))).toBeNull();
  });
});
