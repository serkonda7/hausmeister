import { describe, expect, test } from "bun:test";
import {
  activeFilterCount,
  cleanSearch,
  parseItemsSearch,
  parseOwnerToken,
  patchSearch,
  setAttributeFilter,
  toSearchFilters,
  toSearchInput,
} from "./list-search";

describe("parseItemsSearch", () => {
  test("keeps valid values and drops invalid ones without throwing", () => {
    expect(
      parseItemsSearch({
        q: "  säge ",
        type: "t1",
        owner: ["household", "user:u1", "bogus", "group:"],
        status: ["available", "nope", "sold"],
        tag: "tag1",
        mine: "1",
        sort: "price_desc",
        view: "list",
        junk: 42,
      }),
    ).toEqual({
      q: "säge",
      type: "t1",
      owner: ["household", "user:u1"],
      status: ["available", "sold"],
      tag: ["tag1"],
      mine: true,
      sort: "price_desc",
      view: "list",
    });
  });

  test("bad scalar types are ignored", () => {
    expect(parseItemsSearch({ q: 5, type: "", sort: "fast", view: "table", mine: "no" })).toEqual(
      {},
    );
  });

  test("attribute filters need a type and a value", () => {
    const attr = [
      { key: "season", values: ["Winter"] },
      { key: "voltage", min: 12 },
      { key: "empty" },
      { key: "Bad Key", values: ["x"] },
    ];
    expect(parseItemsSearch({ attr }).attr).toBeUndefined();
    expect(parseItemsSearch({ type: "t", attr }).attr).toEqual([
      { key: "season", values: ["Winter"] },
      { key: "voltage", min: 12 },
    ]);
  });

  test("dedupes list entries", () => {
    expect(parseItemsSearch({ tag: ["a", "a", "b"] }).tag).toEqual(["a", "b"]);
  });

  test("round trip: a cleaned search parses to itself", () => {
    const s = cleanSearch({
      q: "bohrer",
      type: "t",
      attr: [{ key: "season", values: ["Winter"] }],
      owner: ["group:g"],
      gone: true,
      low: true,
      warranty: true,
      sort: "updated_desc",
    });
    expect(parseItemsSearch(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe("cleanSearch", () => {
  test("drops defaults", () => {
    expect(cleanSearch({ sort: "name_asc", view: "grid", mine: false, owner: [] })).toEqual({});
    expect(cleanSearch({ q: "x", sort: "relevance" })).toEqual({ q: "x" });
    expect(cleanSearch({ q: "x", sort: "name_asc" })).toEqual({ q: "x", sort: "name_asc" });
  });

  test("an explicit status list makes `gone` redundant", () => {
    expect(cleanSearch({ status: ["sold"], gone: true })).toEqual({ status: ["sold"] });
  });
});

describe("patchSearch", () => {
  test("changing the type drops its attribute filters", () => {
    const s = { type: "a", attr: [{ key: "k", values: ["v"] }] };
    expect(patchSearch(s, { type: "b" })).toEqual({ type: "b" });
    expect(patchSearch(s, { q: "x" })).toEqual({ ...s, q: "x" });
  });

  test("undefined clears a key", () => {
    expect(patchSearch({ q: "x", loc: "l" }, { loc: undefined })).toEqual({ q: "x" });
  });
});

describe("setAttributeFilter", () => {
  test("adds, replaces and removes one key", () => {
    let s = setAttributeFilter({ type: "t" }, { key: "k", values: ["a"] });
    expect(s.attr).toEqual([{ key: "k", values: ["a"] }]);
    s = setAttributeFilter(s, { key: "k", values: ["b"] });
    expect(s.attr).toEqual([{ key: "k", values: ["b"] }]);
    s = setAttributeFilter(s, { key: "k", values: [] });
    expect(s.attr).toBeUndefined();
  });
});

describe("toSearchFilters / toSearchInput", () => {
  test("maps URL state to server input", () => {
    expect(
      toSearchInput({
        q: "säge",
        type: "t",
        owner: ["household", "user:u1", "group:g1"],
        loc: "l",
        tag: ["x"],
        mine: true,
        gone: true,
        low: true,
        warranty: true,
        attr: [{ key: "k", values: [true] }],
      }),
    ).toEqual({
      q: "säge",
      typeId: "t",
      owners: [
        { ownerKind: "household" },
        { ownerKind: "user", ownerId: "u1" },
        { ownerKind: "group", ownerId: "g1" },
      ],
      mine: true,
      locationId: "l",
      includeGone: true,
      tagIds: ["x"],
      lowStock: true,
      warrantyEnding: true,
      attributes: [{ key: "k", values: [true] }],
      sort: "relevance",
    });
  });

  test("statuses replace includeGone; attributes need a type", () => {
    expect(
      toSearchFilters({ status: ["sold"], gone: true, attr: [{ key: "k", values: [1] }] }),
    ).toEqual({ statuses: ["sold"] });
  });

  test("default sort is by name without a search text", () => {
    expect(toSearchInput({}).sort).toBe("name_asc");
    expect(toSearchInput({ sort: "price_asc" }).sort).toBe("price_asc");
  });
});

test("parseOwnerToken", () => {
  expect(parseOwnerToken("household")).toEqual({ ownerKind: "household" });
  expect(parseOwnerToken("user:1")).toEqual({ ownerKind: "user", ownerId: "1" });
  expect(parseOwnerToken("x:1")).toBeNull();
});

test("activeFilterCount ignores q, sort and view", () => {
  expect(activeFilterCount({ q: "x", sort: "name_desc", view: "list" })).toBe(0);
  expect(
    activeFilterCount({
      type: "t",
      owner: ["household", "user:a"],
      mine: true,
      attr: [{ key: "k", values: ["v"] }],
    }),
  ).toBe(5);
});

describe("unplaced and price range in the URL", () => {
  test("parse: flags and euros (German or dot decimals), bad values dropped", () => {
    expect(parseItemsSearch({ unplaced: "1", pmin: "12,5", pmax: "100" })).toEqual({
      unplaced: true,
      pmin: 12.5,
      pmax: 100,
    });
    expect(parseItemsSearch({ pmin: "-3", pmax: "abc" })).toEqual({});
    expect(parseItemsSearch({ pmin: 9.999 })).toEqual({ pmin: 10 });
    // unplaced wins over a location
    expect(parseItemsSearch({ unplaced: "1", loc: "l" })).toEqual({ unplaced: true });
  });

  test("map to server input in cents; count as one filter each", () => {
    expect(toSearchFilters({ unplaced: true, pmin: 12.5, pmax: 0.1 })).toEqual({
      unplaced: true,
      priceMin: 1250,
      priceMax: 10,
    });
    expect(toSearchFilters({ loc: "l" })).toEqual({ locationId: "l" });
    expect(activeFilterCount({ unplaced: true, pmin: 1, pmax: 2 })).toBe(2);
    expect(patchSearch({ unplaced: true }, { unplaced: undefined, loc: "l" })).toEqual({
      loc: "l",
    });
  });
});
