// ISBN helpers beyond validation (src/lib/item-types/fields.ts has normalizeIsbn / isValidIsbn): converting between ISBN-10 and ISBN-13, so a scan of the barcode (always 13 digits) finds a book stored with ISBN-10.
import { isValidIsbn, normalizeIsbn } from "./item-types/fields";

/** 978-prefixed ISBN-13 for a valid ISBN-10; the ISBN-13 itself when given one. */
export function toIsbn13(input: string): string | null {
  const s = normalizeIsbn(input);
  if (!isValidIsbn(s)) return null;
  if (s.length === 13) return s;
  const body = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** ISBN-10 for a valid 978-prefixed ISBN-13 (979 has none); the ISBN-10 itself when given one. */
export function toIsbn10(input: string): string | null {
  const s = normalizeIsbn(input);
  if (!isValidIsbn(s)) return null;
  if (s.length === 10) return s;
  if (!s.startsWith("978")) return null;
  const body = s.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body[i]);
  const check = (11 - (sum % 11)) % 11;
  return `${body}${check === 10 ? "X" : check}`;
}

/** A scanned EAN-13 that is a book (Bookland 978/979) with a valid check digit. */
export const isBooklandEan = (code: string) => /^97[89]\d{10}$/.test(code) && isValidIsbn(code);

/** Every spelling an ISBN may be stored under (normalized 13 and 10), or [] when not an ISBN. */
export function isbnVariants(input: string): string[] {
  return [...new Set([toIsbn13(input), toIsbn10(input)].filter((x): x is string => !!x))];
}
