export type SniffedMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/heic"
  | "image/avif"
  | "application/pdf";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

function matches(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (bytes.length < offset + expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (bytes[offset + i] !== expected.charCodeAt(i)) return false;
  }
  return true;
}

/** Detects a supported file type from magic bytes only, never from a file name. */
export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (matches(bytes, 0, "\xff\xd8\xff")) return "image/jpeg";
  if (matches(bytes, 0, "\x89PNG\r\n\x1a\n")) return "image/png";
  if (matches(bytes, 0, "GIF87a") || matches(bytes, 0, "GIF89a")) return "image/gif";
  if (matches(bytes, 0, "RIFF") && matches(bytes, 8, "WEBP")) return "image/webp";
  if (matches(bytes, 0, "%PDF-")) return "application/pdf";

  if (matches(bytes, 4, "ftyp") && bytes.length >= 12) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (HEIC_BRANDS.has(brand)) return "image/heic";
    if (AVIF_BRANDS.has(brand)) return "image/avif";
  }

  return null;
}
