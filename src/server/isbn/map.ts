// Book data -> an item type's attribute values (stored shape, see src/lib/item-types/fields.ts).
// Matches by field key, the way the starter type "Buch" names its fields (authors, isbn, publisher, year, series, language), plus a few common alternatives; every `isbn` field gets the ISBN.
// Only active fields of a fitting kind are filled; numbers outside a field's min/max are left out.
// Pure.
import type { FieldDefinition } from "../../lib/item-types/fields";
import type { BookData } from "./lookup";

const KEYS: Record<string, keyof BookData> = {
  authors: "authors",
  author: "authors",
  subtitle: "subtitle",
  publisher: "publisher",
  year: "year",
  published_year: "year",
  language: "language",
  series: "series",
  pages: "pages",
  page_count: "pages",
};

export function bookAttributes(
  fields: readonly FieldDefinition[],
  book: BookData,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.hidden) continue;
    if (f.kind === "isbn") {
      out[f.key] = book.isbn;
      continue;
    }
    const src = KEYS[f.key];
    const v = src ? book[src] : undefined;
    if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    if (f.kind === "text" || f.kind === "longtext") {
      const list = (Array.isArray(v) ? v : [v]).map(String);
      out[f.key] = f.kind === "text" && f.multiple ? list : list.join(", ");
    } else if (f.kind === "integer" && typeof v === "number") {
      if ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) continue;
      out[f.key] = v;
    }
  }
  return out;
}
