import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createItemType } from "../item-types/service";
import { STARTER_TEMPLATES } from "../item-types/templates";
import { ItemsError } from "../items/errors";
import { setupFixture } from "../items/test-fixtures";
import {
  clearIsbnCache,
  lookupIsbn,
  parseDnb,
  parseGoogleBooks,
  parseOpenLibrary,
  USER_AGENT,
} from "./lookup";
import { lookupBook, resetIsbnRateLimit } from "./service";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", name), "utf8");
const DNB = fixture("dnb-9783257071481.xml");
const OL = fixture("openlibrary-9780140328721.json");
const DNB_EMPTY =
  '<?xml version="1.0"?><searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><numberOfRecords>0</numberOfRecords></searchRetrieveResponse>';

type Call = { url: string; ua: string | null };
function fakeFetch(answers: Record<string, () => Response>, calls: Call[] = []) {
  return async (url: string, init: RequestInit) => {
    calls.push({ url, ua: new Headers(init.headers).get("user-agent") });
    const host = new URL(url).host;
    const a = answers[host];
    if (!a) throw new TypeError("fetch failed");
    return a();
  };
}

beforeEach(() => {
  clearIsbnCache();
  resetIsbnRateLimit();
});

describe("parsers", () => {
  test("DNB MARC21: title, subtitle, authors as written, publisher, year, language, pages", () => {
    expect(parseDnb(DNB)).toEqual({
      title: "Hard land",
      subtitle: "Roman",
      authors: ["Benedict Wells"],
      publisher: "Diogenes",
      year: 2021,
      language: "Deutsch",
      series: null,
      pages: 345,
    });
    expect(parseDnb(DNB_EMPTY)).toBeNull();
  });

  test("DNB: entities and non-sorting marks are cleaned, series and parts kept", () => {
    const xml = `<numberOfRecords>1</numberOfRecords><records><record><recordData>
      <datafield tag="245" ind1="1" ind2="0"><subfield code="a">&#172;Der&#172; Herr der Ringe</subfield><subfield code="n">1</subfield><subfield code="p">Die Gef&#228;hrten</subfield></datafield>
      <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Tolkien, J. R. R.</subfield><subfield code="4">aut</subfield></datafield>
      <datafield tag="700" ind1="1" ind2=" "><subfield code="a">Krege, Wolfgang</subfield><subfield code="4">trl</subfield></datafield>
      <datafield tag="260" ind1=" " ind2=" "><subfield code="b">Klett-Cotta &amp; Co.</subfield><subfield code="c">c 2000</subfield></datafield>
      <datafield tag="490" ind1="0" ind2=" "><subfield code="a">Hobbit Presse ;</subfield></datafield>
      </recordData></record></records>`;
    expect(parseDnb(xml)).toMatchObject({
      title: "Der Herr der Ringe. 1 Die Gefährten",
      authors: ["J. R. R. Tolkien"],
      publisher: "Klett-Cotta & Co.",
      year: 2000,
      series: "Hobbit Presse",
    });
  });

  test("Open Library and Google Books", () => {
    expect(parseOpenLibrary(JSON.parse(OL))).toEqual({
      title: "Fantastic Mr. Fox",
      subtitle: null,
      authors: ["Roald Dahl"],
      publisher: "Puffin",
      year: 1988,
      language: null,
      series: null,
      pages: 96,
    });
    expect(parseOpenLibrary({})).toBeNull();
    expect(
      parseGoogleBooks({
        items: [
          {
            volumeInfo: {
              title: "Tschick",
              authors: ["Wolfgang Herrndorf"],
              publisher: "Rowohlt",
              publishedDate: "2012-03-01",
              pageCount: 256,
              language: "de",
            },
          },
        ],
      }),
    ).toMatchObject({ title: "Tschick", year: 2012, pages: 256, language: "Deutsch" });
    expect(parseGoogleBooks({ totalItems: 0 })).toBeNull();
  });
});

describe("lookupIsbn", () => {
  test("asks the sources in order, stops at the first hit, sends a generic user agent", async () => {
    const calls: Call[] = [];
    const f = fakeFetch(
      {
        "services.dnb.de": () => new Response(DNB_EMPTY),
        "openlibrary.org": () => new Response(OL),
      },
      calls,
    );
    const r = await lookupIsbn("9780140328721", ["dnb", "openlibrary", "google"], { fetch: f });
    expect(r).toMatchObject({
      status: "found",
      book: { source: "openlibrary", isbn: "9780140328721" },
    });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["services.dnb.de", "openlibrary.org"]);
    expect(calls[0]?.url).toContain("query=num%3D9780140328721");
    expect(calls.every((c) => c.ua === USER_AGENT)).toBe(true);
    // Cached: no second round trip.
    await lookupIsbn("9780140328721", ["dnb", "openlibrary", "google"], { fetch: f });
    expect(calls).toHaveLength(2);
  });

  test("rate limits and network errors fall through; nobody answering is 'unavailable'", async () => {
    const limited = fakeFetch({
      "services.dnb.de": () => new Response("Too Many Requests", { status: 429 }),
      "openlibrary.org": () => new Response("{}"),
    });
    expect(await lookupIsbn("9783257071481", ["dnb", "openlibrary"], { fetch: limited })).toEqual({
      status: "not_found",
    });
    clearIsbnCache();
    const down = fakeFetch({});
    expect(await lookupIsbn("9783257071481", ["dnb", "openlibrary"], { fetch: down })).toEqual({
      status: "unavailable",
    });
  });
});

describe("lookupBook", () => {
  function bookType() {
    const f = setupFixture();
    const tpl = STARTER_TEMPLATES.find((t) => t.key === "book")!;
    const book = createItemType(f.db, f.admin, {
      key: "book",
      name: tpl.name,
      icon: null,
      tracking: "individual",
      parentId: null,
      fields: tpl.fields,
    });
    return { ...f, book };
  }

  test("fills the starter book type's fields from DNB", async () => {
    const f = bookType();
    const r = await lookupBook(
      f.db,
      f.anna,
      { isbn: "3-257-07148-5", typeId: f.book.id },
      { fetch: fakeFetch({ "services.dnb.de": () => new Response(DNB) }) },
    );
    expect(r).toEqual({
      status: "found",
      name: "Hard land",
      book: expect.objectContaining({ source: "dnb", isbn: "9783257071481" }),
      attributes: {
        authors: ["Benedict Wells"],
        isbn: "9783257071481",
        publisher: "Diogenes",
        year: 2021,
        language: "Deutsch",
      },
    });
  });

  test("guests may not; bad ISBNs are rejected before any request", async () => {
    const f = bookType();
    const calls: Call[] = [];
    const fetch = fakeFetch({}, calls);
    const err = async (p: Promise<unknown>) =>
      p.then(
        () => "OK",
        (e) => (e instanceof ItemsError ? e.code : (e as Error).message),
      );
    expect(await err(lookupBook(f.db, f.gast, { isbn: "9783257071481" }, { fetch }))).toBe(
      "ITEM_FORBIDDEN",
    );
    expect(await err(lookupBook(f.db, f.anna, { isbn: "9783257071482" }, { fetch }))).toBe(
      "ISBN_INVALID",
    );
    expect(calls).toHaveLength(0);
    expect(await lookupBook(f.db, f.anna, { isbn: "9783257071481" }, { fetch })).toEqual({
      status: "unavailable",
      isbn: "9783257071481",
    });
  });

  test("other types: only matching fields are filled", async () => {
    const f = bookType();
    const comic = createItemType(f.db, f.admin, {
      key: "comic",
      name: "Comic",
      icon: null,
      tracking: "individual",
      parentId: null,
      fields: [
        { key: "code", label: "ISBN", kind: "isbn", lookup: ["openlibrary"] },
        { key: "author", label: "Autor", kind: "text" },
        { key: "year", label: "Jahr", kind: "integer", min: 2000 },
      ],
    });
    const r = await lookupBook(
      f.db,
      f.anna,
      { isbn: "9780140328721", typeId: comic.id },
      { fetch: fakeFetch({ "openlibrary.org": () => new Response(OL) }) },
    );
    expect(r.status === "found" && r.attributes).toEqual({
      code: "9780140328721",
      author: "Roald Dahl",
    });
  });
});
