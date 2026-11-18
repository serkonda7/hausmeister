// Book data for an ISBN (DESIGN §5.2 "Book lookup"): Deutsche
// Nationalbibliothek SRU (MARC21, free, no key, best German coverage), then
// Open Library, then Google Books, in the order an `isbn` field's `lookup`
// lists them. Outbound calls go from the server, with a generic user agent
// and nothing about the household in them.
//
// Each source gets a short timeout. A source that fails (network, HTTP error,
// 429 rate limit, unreadable answer) is skipped like one that knows nothing;
// the result says "unavailable" only when no source could answer at all.
// Results are cached in memory (hits a day, misses ten minutes), so shelf
// mode and repeated scans don't hammer the services.
import type { IsbnLookup } from "../../lib/item-types/fields";

export type BookData = {
  /** ISBN-13 as looked up. */
  isbn: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  year: number | null;
  /** German language name ("Deutsch"), or the code when unknown. */
  language: string | null;
  series: string | null;
  pages: number | null;
  source: IsbnLookup;
};

export type BookLookup =
  | { status: "found"; book: BookData }
  | { status: "not_found" }
  | { status: "unavailable" };

type Parsed = Omit<BookData, "isbn" | "source">;
type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export const USER_AGENT = "Hausmeister/1.1 (self-hosted household inventory)";
const TIMEOUT_MS = 6000;

// --- Small text helpers ------------------------------------------------------------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) => {
    if (e[0] === "#")
      return String.fromCodePoint(
        e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)),
      );
    return ENTITIES[e] ?? all;
  });
}

/** Cataloguing punctuation and DNB's non-sorting marks ("¬Der¬ Hobbit"). */
function clean(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s
    .replace(/[¬\u0098\u009c]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[/:;,=]\s*$/, "")
    .trim();
  return t || null;
}

/** "Wells, Benedict" -> "Benedict Wells" (one comma only; corporate names stay). */
function personName(s: string): string {
  const t = clean(s) ?? "";
  const parts = t.split(",").map((p) => p.trim());
  return parts.length === 2 && parts[0] && parts[1] ? `${parts[1]} ${parts[0]}` : t;
}

function yearOf(s: string | undefined | null): number | null {
  const m = s?.match(/(1[4-9]\d\d|20\d\d|2100)/);
  return m ? Number(m[1]) : null;
}

const LANGUAGES: Record<string, string> = {
  ger: "Deutsch",
  deu: "Deutsch",
  de: "Deutsch",
  eng: "Englisch",
  en: "Englisch",
  fre: "Französisch",
  fra: "Französisch",
  fr: "Französisch",
  spa: "Spanisch",
  es: "Spanisch",
  ita: "Italienisch",
  it: "Italienisch",
  dut: "Niederländisch",
  nld: "Niederländisch",
  nl: "Niederländisch",
  pol: "Polnisch",
  pl: "Polnisch",
  tur: "Türkisch",
  tr: "Türkisch",
  lat: "Latein",
  la: "Latein",
};
const languageName = (code: string | undefined | null) =>
  code ? (LANGUAGES[code.toLowerCase()] ?? code) : null;

const pagesOf = (s: string | number | undefined | null) => {
  if (typeof s === "number") return Number.isInteger(s) && s > 0 ? s : null;
  const m = s?.match(/(\d+)\s*(S\.|Seiten|p\.|pages)/i);
  return m ? Number(m[1]) : null;
};

// --- DNB (MARC21-xml over SRU) ------------------------------------------------------

type Field = { tag: string; sub: [string, string][] };

function marcFields(record: string): Field[] {
  const out: Field[] = [];
  for (const m of record.matchAll(
    /<datafield\b[^>]*\btag="(\d{3})"[^>]*>([\s\S]*?)<\/datafield>/g,
  )) {
    const sub: [string, string][] = [];
    for (const s of (m[2] ?? "").matchAll(
      /<subfield\b[^>]*\bcode="(.)"[^>]*>([\s\S]*?)<\/subfield>/g,
    ))
      sub.push([s[1] ?? "", decodeXml(s[2] ?? "")]);
    out.push({ tag: m[1] ?? "", sub });
  }
  return out;
}

const subOf = (f: Field | undefined, code: string) => f?.sub.find(([c]) => c === code)?.[1];

export function parseDnb(xml: string): Parsed | null {
  if (!/<numberOfRecords>\s*[1-9]/.test(xml)) return null;
  const record = xml.split(/<\/recordData>/)[0] ?? "";
  const fields = marcFields(record);
  const get = (tag: string) => fields.find((f) => f.tag === tag);
  const all = (tag: string) => fields.filter((f) => f.tag === tag);
  const t = get("245");
  const title = clean(subOf(t, "a"));
  if (!title) return null;
  const part = [subOf(t, "n"), subOf(t, "p")].map(clean).filter(Boolean).join(" ");
  const authors = [...all("100"), ...all("700")]
    .filter((f) => {
      const role = subOf(f, "4");
      return f.tag === "100" || role === undefined || role === "aut";
    })
    .map((f) => subOf(f, "a"))
    .filter((a): a is string => !!a)
    .map(personName);
  const pub = get("264") ?? get("260");
  const series = get("490") ?? get("830");
  return {
    title: part ? `${title}. ${part}` : title,
    subtitle: clean(subOf(t, "b")),
    authors: [...new Set(authors)],
    publisher: clean(subOf(pub, "b")),
    year: yearOf(subOf(pub, "c")),
    language: languageName(subOf(get("041"), "a")),
    series: clean(subOf(series, "a")),
    pages: pagesOf(subOf(get("300"), "a")),
  };
}

// --- Open Library ----------------------------------------------------------------------

type OlBook = {
  title?: string;
  subtitle?: string;
  authors?: { name?: string }[];
  publishers?: { name?: string }[];
  publish_date?: string;
  number_of_pages?: number;
  pagination?: string;
};

export function parseOpenLibrary(json: unknown): Parsed | null {
  const first = json && typeof json === "object" ? Object.values(json)[0] : undefined;
  const b = first as OlBook | undefined;
  const title = clean(b?.title);
  if (!b || !title) return null;
  return {
    title,
    subtitle: clean(b.subtitle),
    authors: (b.authors ?? []).map((a) => clean(a.name)).filter((a): a is string => !!a),
    publisher: clean(b.publishers?.[0]?.name),
    year: yearOf(b.publish_date),
    language: null,
    series: null,
    pages: pagesOf(b.number_of_pages ?? b.pagination),
  };
}

// --- Google Books ----------------------------------------------------------------------

type GVolume = {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  pageCount?: number;
  language?: string;
};

export function parseGoogleBooks(json: unknown): Parsed | null {
  const items = (json as { items?: { volumeInfo?: GVolume }[] } | null)?.items;
  const v = items?.[0]?.volumeInfo;
  const title = clean(v?.title);
  if (!v || !title) return null;
  return {
    title,
    subtitle: clean(v.subtitle),
    authors: (v.authors ?? []).map(clean).filter((a): a is string => !!a),
    publisher: clean(v.publisher),
    year: yearOf(v.publishedDate),
    language: languageName(v.language),
    series: null,
    pages: pagesOf(v.pageCount),
  };
}

// --- Sources and the lookup -----------------------------------------------------------

const SOURCES: Record<
  IsbnLookup,
  { url: (isbn: string) => string; parse: (res: Response) => Promise<Parsed | null> }
> = {
  dnb: {
    url: (isbn) =>
      `https://services.dnb.de/sru/dnb?version=1.1&operation=searchRetrieve&query=num%3D${isbn}&recordSchema=MARC21-xml&maximumRecords=1`,
    parse: async (res) => parseDnb(await res.text()),
  },
  openlibrary: {
    url: (isbn) => `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    parse: async (res) => parseOpenLibrary(await res.json()),
  },
  google: {
    url: (isbn) => `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
    parse: async (res) => parseGoogleBooks(await res.json()),
  },
};

const HIT_TTL = 24 * 60 * 60_000;
const MISS_TTL = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; result: BookLookup }>();

export function clearIsbnCache() {
  cache.clear();
}

/**
 * Looks the ISBN-13 up in `sources`, in order, until one knows the book.
 * `fetch` is injectable for tests.
 */
export async function lookupIsbn(
  isbn13: string,
  sources: readonly IsbnLookup[],
  opts: { fetch?: Fetch; timeoutMs?: number; now?: number } = {},
): Promise<BookLookup> {
  const now = opts.now ?? Date.now();
  const key = `${isbn13}|${sources.join(",")}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < (hit.result.status === "found" ? HIT_TTL : MISS_TTL)) return hit.result;
  const doFetch: Fetch = opts.fetch ?? ((u, i) => fetch(u, i));
  let answered = false;
  let result: BookLookup = { status: "not_found" };
  for (const name of sources) {
    const src = SOURCES[name];
    try {
      const res = await doFetch(src.url(isbn13), {
        headers: { "user-agent": USER_AGENT, accept: "application/json, application/xml" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
        redirect: "follow",
      });
      if (!res.ok) {
        await res.body?.cancel();
        continue;
      }
      const parsed = await src.parse(res);
      answered = true;
      if (parsed) {
        result = { status: "found", book: { ...parsed, isbn: isbn13, source: name } };
        break;
      }
    } catch (err) {
      console.warn(`[isbn] ${name} failed: ${(err as Error).name}`);
    }
  }
  if (result.status === "not_found" && !answered) return { status: "unavailable" };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, result });
  return result;
}
