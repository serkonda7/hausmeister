/**
 * Produces a lowercase, diacritic-free, whitespace-normalized form suitable
 * for searching. Note that "ä" becomes "a" (not "ae") and "ß" becomes "ss".
 */
export function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
