import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import fc from "fast-check";
import { ITEM_SORTS } from "../../lib/items/constants";
import type { SearchItemsInput } from "../../lib/items/inputs";
import { normalizeSearchText } from "../../lib/normalize";
import { itemLevel } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import { itemGrants, items } from "../db/schema";
import { ItemsError } from "../items/errors";
import { moveItem, setItemGrant, updateItem } from "../items/service";
import { type Fixture, setupFixture } from "../items/test-fixtures";
import { createLocation } from "../locations/service";
import { pickItems, searchFacets, searchItems } from "./query";

const names = (f: Fixture, ctx: AuthCtx, input: SearchItemsInput) =>
  searchItems(f.db, ctx, { limit: 200, ...input })
    .items.map((r) => r.name)
    .sort();

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

function world() {
  const f = setupFixture();
  const { anna, ben, admin } = f;
  const house = createLocation(f.db, admin, { name: "Haus" });
  const garage = createLocation(f.db, admin, { name: "Garage", parentId: house.id });
  const shelf = createLocation(f.db, admin, { name: "Regal 2", parentId: garage.id });
  const cellar = createLocation(f.db, admin, { name: "Keller" });
  const box = f.item(anna, { name: "Werkzeugkiste", locationId: shelf.id });
  const ids = {
    akku: f.item(anna, {
      name: "Akkuschrauber",
      typeId: f.power.id,
      locationId: garage.id,
      attributes: { brand: "Bosch", voltage: 18, battery: "Bosch 18V", cordless: true },
      tags: ["Werkstatt"],
      priceCents: 12900,
    }).id,
    saege: f.item(anna, {
      name: "Stichsäge",
      description: "Für Holz und Metall",
      containerItemId: box.id,
      tags: ["Werkstatt", "Holz"],
      priceCents: 5900,
    }).id,
    besen: f.item(ben, {
      name: "Straßenbesen",
      locationId: cellar.id,
      owner: { ownerKind: "user", ownerId: ben.userId },
      priceCents: 1500,
    }).id,
    jacke: f.item(anna, {
      name: "Winterjacke",
      owner: { ownerKind: "user", ownerId: anna.userId },
      attributes: { size: { system: "child", value: "128" }, season: "Winter", keeper: ben.userId },
      priceCents: 4000,
    }).id,
    sommer: f.item(anna, {
      name: "Sommerjacke",
      owner: { ownerKind: "user", ownerId: anna.userId },
      attributes: { size: { system: "child", value: "128" }, season: "Sommer", colors: ["rot"] },
    }).id,
    klein: f.item(anna, {
      name: "Jacke klein",
      owner: { ownerKind: "user", ownerId: anna.userId },
      attributes: {
        size: { system: "child", value: "104" },
        season: "Winter",
        colors: ["blau", "rot"],
      },
      status: "given_away",
    }).id,
    geheim: f.item(anna, {
      name: "Geheimes Tagebuch",
      owner: { ownerKind: "user", ownerId: anna.userId },
      visibility: "private",
      tags: ["Privat"],
    }).id,
    schrauben: f.item(anna, {
      name: "Schrauben M6",
      typeId: f.other.id,
      attributes: { shop: "Baumarkt" },
      quantity: 3,
      minQuantity: 10,
      unit: "Stk",
    }).id,
    box: box.id,
  };
  return { f, ids, loc: { house, garage, shelf, cellar } };
}

describe("search text", () => {
  test("trigram substring matches compound words", () => {
    const { f } = world();
    expect(names(f, f.anna, { q: "schrauber" })).toEqual(["Akkuschrauber"]);
    expect(names(f, f.anna, { q: "säge" })).toEqual(["Stichsäge"]);
    expect(names(f, f.anna, { q: "jacke" })).toEqual(["Sommerjacke", "Winterjacke"]);
  });

  test("umlauts and ß are folded the same way in index and query", () => {
    const { f } = world();
    for (const q of ["Sage", "SÄGE", "säge", "stichsage"])
      expect(names(f, f.anna, { q })).toEqual(["Stichsäge"]);
    for (const q of ["strasse", "Straße", "STRASSENBESEN"])
      expect(names(f, f.anna, { q })).toEqual(["Straßenbesen"]);
  });

  test("description, tags, attributes, user names and short codes are searched", () => {
    const { f, ids } = world();
    expect(names(f, f.anna, { q: "metall" })).toEqual(["Stichsäge"]);
    expect(names(f, f.anna, { q: "werkstatt" })).toEqual(["Akkuschrauber", "Stichsäge"]);
    expect(names(f, f.anna, { q: "bosch" })).toEqual(["Akkuschrauber"]);
    expect(names(f, f.anna, { q: "winter" })).toEqual(["Winterjacke"]);
    expect(names(f, f.anna, { q: "ben" })).toContain("Winterjacke"); // keeper: Ben
    expect(names(f, f.anna, { q: "kabellos" })).toEqual(["Akkuschrauber"]); // true boolean label
    const code = f.db.select().from(items).where(eq(items.id, ids.besen)).get()!.shortCode!;
    expect(names(f, f.anna, { q: code })).toEqual(["Straßenbesen"]);
  });

  test("several words must all match; short words must occur in the name", () => {
    const { f } = world();
    expect(names(f, f.anna, { q: "akku bosch" })).toEqual(["Akkuschrauber"]);
    expect(names(f, f.anna, { q: "akku metall" })).toEqual([]);
    expect(names(f, f.anna, { q: "schrauben m6" })).toEqual(["Schrauben M6"]);
    expect(names(f, f.anna, { q: "schrauben m7" })).toEqual([]);
  });

  test("queries under 3 characters use a prefix match on the name (words too)", () => {
    const { f } = world();
    const page = searchItems(f.db, f.anna, { q: "ak" });
    expect(page.mode).toBe("prefix");
    expect(page.sort).toBe("name_asc");
    expect(page.items.map((r) => r.name)).toEqual(["Akkuschrauber"]);
    expect(names(f, f.anna, { q: "St" })).toEqual(["Stichsäge", "Straßenbesen"]);
    expect(names(f, f.anna, { q: "kl" })).toEqual([]); // "Jacke klein" is gone
    expect(names(f, f.anna, { q: "kl", includeGone: true })).toEqual(["Jacke klein"]);
    expect(names(f, f.anna, { q: "ub" })).toEqual([]); // not a prefix
    expect(names(f, f.anna, { q: "%" })).toEqual([]); // LIKE wildcards are escaped
    expect(searchItems(f.db, f.anna, { q: "schrauber" }).mode).toBe("fts");
  });

  test("FTS syntax in the query is treated as text", () => {
    const { f } = world();
    for (const q of ['"', "akku OR", "NOT*", "a:b", "(((", "NEAR(x y)"])
      expect(code(() => searchItems(f.db, f.anna, { q }))).toBe("OK");
  });
});

describe("filters", () => {
  test("type includes subtypes", () => {
    const { f } = world();
    expect(names(f, f.anna, { typeId: f.power.id })).toEqual(["Akkuschrauber"]);
    expect(names(f, f.anna, { typeId: f.tool.id })).toEqual([
      "Akkuschrauber",
      "Geheimes Tagebuch",
      "Sommerjacke",
      "Stichsäge",
      "Straßenbesen",
      "Werkzeugkiste",
      "Winterjacke",
    ]);
  });

  test("location includes sub-locations and items in containers; direct does not", () => {
    const { f, loc } = world();
    expect(names(f, f.anna, { locationId: loc.house.id })).toEqual([
      "Akkuschrauber",
      "Stichsäge",
      "Werkzeugkiste",
    ]);
    expect(names(f, f.anna, { locationId: loc.shelf.id, locationScope: "direct" })).toEqual([
      "Werkzeugkiste",
    ]);
    expect(names(f, f.anna, { locationId: loc.garage.id, locationScope: "direct" })).toEqual([
      "Akkuschrauber",
    ]);
  });

  test("container, owner, mine, status, tags, low stock", () => {
    const { f, ids } = world();
    expect(names(f, f.anna, { containerId: ids.box })).toEqual(["Stichsäge"]);
    expect(names(f, f.anna, { owners: [{ ownerKind: "user", ownerId: f.ben.userId }] })).toEqual([
      "Straßenbesen",
    ]);
    expect(names(f, f.ben, { mine: true })).toEqual(["Straßenbesen"]);
    expect(names(f, f.anna, { mine: true })).toEqual([
      "Geheimes Tagebuch",
      "Sommerjacke",
      "Winterjacke",
    ]);
    expect(names(f, f.anna, { mine: true, includeGone: true })).toContain("Jacke klein");
    expect(names(f, f.anna, { statuses: ["given_away"] })).toEqual(["Jacke klein"]);
    const werkstatt = searchFacets(f.db, f.anna, {}).tags.find((t) => t.name === "Werkstatt")!;
    const holz = searchFacets(f.db, f.anna, {}).tags.find((t) => t.name === "Holz")!;
    expect(names(f, f.anna, { tagIds: [werkstatt.id] })).toEqual(["Akkuschrauber", "Stichsäge"]);
    expect(names(f, f.anna, { tagIds: [werkstatt.id, holz.id] })).toEqual(["Stichsäge"]);
    expect(names(f, f.anna, { lowStock: true })).toEqual(["Schrauben M6"]);
    const row = searchItems(f.db, f.anna, { lowStock: true }).items[0]!;
    expect(row.lowStock).toBe(true);
  });

  test("type-specific attributes (json_extract): size 128 and season Winter", () => {
    const { f } = world();
    const t = f.tool.id;
    expect(
      names(f, f.anna, {
        typeId: t,
        attributes: [
          { key: "size", values: ["128"] },
          { key: "season", values: ["Winter"] },
        ],
      }),
    ).toEqual(["Winterjacke"]);
    expect(names(f, f.anna, { typeId: t, attributes: [{ key: "size", values: ["128"] }] })).toEqual(
      ["Sommerjacke", "Winterjacke"],
    );
    expect(
      names(f, f.anna, {
        typeId: t,
        includeGone: true,
        attributes: [{ key: "colors", values: ["rot"] }],
      }),
    ).toEqual(["Jacke klein", "Sommerjacke"]);
    expect(
      names(f, f.anna, { typeId: t, attributes: [{ key: "voltage", min: 12, max: 20 }] }),
    ).toEqual(["Akkuschrauber"]);
    expect(names(f, f.anna, { typeId: t, attributes: [{ key: "voltage", min: 19 }] })).toEqual([]);
    expect(
      names(f, f.anna, { typeId: t, attributes: [{ key: "cordless", values: [true] }] }),
    ).toEqual(["Akkuschrauber"]);
    expect(
      names(f, f.anna, { typeId: t, attributes: [{ key: "brand", values: ["BOSCH"] }] }),
    ).toEqual(["Akkuschrauber"]);
    expect(
      names(f, f.anna, { typeId: t, attributes: [{ key: "keeper", values: [f.ben.userId] }] }),
    ).toEqual(["Winterjacke"]);
    expect(
      code(() => searchItems(f.db, f.anna, { attributes: [{ key: "size", values: ["1"] }] })),
    ).toBe("SEARCH_ATTRIBUTE_NEEDS_TYPE");
    expect(
      code(() =>
        searchItems(f.db, f.anna, { typeId: t, attributes: [{ key: "nope", values: ["1"] }] }),
      ),
    ).toBe("SEARCH_ATTRIBUTE_UNKNOWN");
  });

  test("price filter only matches prices the caller may see", () => {
    const { f } = world();
    // Anna's jacket is household-visible: Ben may view it, not its price.
    expect(names(f, f.anna, { priceMin: 3000, priceMax: 5000 })).toEqual(["Winterjacke"]);
    expect(names(f, f.ben, { priceMin: 3000, priceMax: 5000 })).toEqual([]);
    expect(names(f, f.ben, { priceMax: 2000 })).toEqual(["Straßenbesen"]);
    expect(names(f, f.gast, { priceMin: 0 })).toEqual([]);
  });
});

describe("sorting and pagination", () => {
  function many() {
    const f = setupFixture();
    const words = ["Apfel", "Äpfel", "apfel", "Birne", "Zange", "Öl", "Bürste", "Ast"];
    for (let i = 0; i < 37; i++)
      f.item(f.anna, {
        name: `${words[i % words.length]} ${i % 5}`,
        priceCents: i % 3 === 0 ? null : (i * 37) % 500,
      });
    return f;
  }

  function allPages(f: Fixture, ctx: AuthCtx, input: SearchItemsInput, limit: number) {
    const out: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 100; guard++) {
      const page = searchItems(f.db, ctx, { ...input, limit, cursor });
      out.push(...page.items.map((r) => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  test("every sort: pages concatenate to the full list, without gaps or duplicates", () => {
    const f = many();
    for (const sort of ITEM_SORTS) {
      const input = { sort, q: sort === "relevance" ? "apfel" : undefined };
      const full = searchItems(f.db, f.anna, { ...input, limit: 200 });
      for (const limit of [1, 4, 7]) {
        const paged = allPages(f, f.anna, input, limit);
        expect(paged).toEqual(full.items.map((r) => r.id));
      }
      expect(full.total).toBe(full.items.length);
    }
  });

  test("name sort folds case and umlauts (Äpfel next to Apfel)", () => {
    const f = many();
    const list = searchItems(f.db, f.anna, { sort: "name_asc", limit: 200 }).items.map((r) =>
      normalizeSearchText(r.name),
    );
    expect(list).toEqual([...list].sort());
    const desc = searchItems(f.db, f.anna, { sort: "name_desc", limit: 200 }).items.map((r) =>
      normalizeSearchText(r.name),
    );
    expect(desc).toEqual([...list].reverse());
  });

  test("pages stay stable when items are added or renamed between requests", () => {
    const f = many();
    const first = searchItems(f.db, f.anna, { sort: "name_asc", limit: 10 });
    f.item(f.anna, { name: "Aaa neu" }); // sorts before the cursor
    const second = searchItems(f.db, f.anna, {
      sort: "name_asc",
      limit: 10,
      cursor: first.nextCursor!,
    });
    const ids1 = new Set(first.items.map((r) => r.id));
    expect(second.items.some((r) => ids1.has(r.id))).toBe(false);
    expect(
      normalizeSearchText(second.items[0]!.name) >= normalizeSearchText(first.items.at(-1)!.name),
    ).toBe(true);
  });

  test("a cursor of another sort or garbage is CURSOR_INVALID", () => {
    const f = many();
    const p = searchItems(f.db, f.anna, { sort: "name_asc", limit: 3 });
    expect(
      code(() => searchItems(f.db, f.anna, { sort: "updated_desc", cursor: p.nextCursor! })),
    ).toBe("CURSOR_INVALID");
    expect(code(() => searchItems(f.db, f.anna, { cursor: "garbage" }))).toBe("CURSOR_INVALID");
  });

  test("price sort never orders by prices the caller may not see", () => {
    const f = setupFixture();
    // Anna's own (household-visible) items: Ben sees them at `view`, without price.
    const mine = { ownerKind: "user" as const, ownerId: f.anna.userId };
    const cheap = f.item(f.anna, { name: "Billig", owner: mine, priceCents: 1 });
    const dear = f.item(f.anna, { name: "Teuer", owner: mine, priceCents: 100000 });
    const benOwn = f.item(f.ben, {
      name: "Bens",
      owner: { ownerKind: "user", ownerId: f.ben.userId },
      priceCents: 500,
    });
    const asc = searchItems(f.db, f.ben, { sort: "price_asc" }).items.map((r) => r.id);
    const desc = searchItems(f.db, f.ben, { sort: "price_desc" }).items.map((r) => r.id);
    const hidden = [cheap.id, dear.id].sort();
    // Ben's own priced item first, then the hidden ones in id order, both directions.
    expect(asc).toEqual([benOwn.id, ...hidden]);
    expect(desc).toEqual([benOwn.id, ...hidden]);
    // Anna sees the real order.
    expect(searchItems(f.db, f.anna, { sort: "price_desc" }).items.map((r) => r.name)).toEqual([
      "Teuer",
      "Billig",
      "Bens",
    ]);
  });

  test("relevance needs FTS; otherwise it falls back to name order", () => {
    const f = many();
    expect(searchItems(f.db, f.anna, { sort: "relevance" }).sort).toBe("name_asc");
    expect(searchItems(f.db, f.anna, { q: "apfel" }).sort).toBe("relevance");
  });
});

describe("visibility", () => {
  test("search, facets and the picker never show invisible items", () => {
    const { f, ids } = world();
    expect(names(f, f.ben, { q: "tagebuch" })).toEqual([]);
    expect(names(f, f.ben, { q: "ge" })).toEqual([]);
    expect(names(f, f.gast, {})).toEqual([]);
    const facets = searchFacets(f.db, f.ben, {});
    expect(facets.tags.map((t) => t.name)).not.toContain("Privat");
    expect(JSON.stringify(facets)).not.toContain("Tagebuch");
    expect(pickItems(f.db, f.ben, { q: "tagebuch" })).toEqual([]);
    expect(pickItems(f.db, f.anna, { q: "tagebuch" }).map((p) => p.id)).toEqual([ids.geheim]);
    expect(pickItems(f.db, f.anna, { q: "jacke klein" })).toEqual([]); // gone
    expect(
      pickItems(f.db, f.anna, { q: "jacke", excludeId: ids.jacke }).map((p) => p.name),
    ).toEqual(["Sommerjacke"]);
  });

  test("a container the caller cannot see is masked in list rows", () => {
    const f = setupFixture();
    const box = f.item(f.anna, {
      name: "Annas Kiste",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const inside = f.item(f.anna, { name: "Hammer", containerItemId: box.id });
    const benRow = searchItems(f.db, f.ben, { q: "hammer" }).items[0]!;
    expect(benRow.id).toBe(inside.id);
    expect(benRow.containerItemId).toBeNull();
    expect(searchItems(f.db, f.anna, { q: "hammer" }).items[0]!.containerItemId).toBe(box.id);
  });

  test("property: results are exactly the visible items matching the text", () => {
    const vocab = ["Hammer", "Säge", "Bohrer", "Zange", "Leiter", "Schrauber"];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            word: fc.constantFrom(...vocab),
            word2: fc.constantFrom(...vocab),
            owner: fc.constantFrom("household", "anna", "ben", "kinder"),
            priv: fc.boolean(),
            grant: fc.constantFrom(null, "gast:view", "gast:use", "anna:edit", "kinder:view"),
          }),
          { minLength: 1, maxLength: 14 },
        ),
        fc.constantFrom("admin", "anna", "ben", "gast"),
        fc.constantFrom("sag", "hammer", "bohr", "ange", "schraub", "leit", "xyz", "ha", ""),
        (rows, who, q) => {
          const f = setupFixture();
          const ctx = { admin: f.admin, anna: f.anna, ben: f.ben, gast: f.gast }[who];
          for (const r of rows) {
            const owner =
              r.owner === "household"
                ? { ownerKind: "household" as const }
                : r.owner === "kinder"
                  ? { ownerKind: "group" as const, ownerId: f.group.id }
                  : {
                      ownerKind: "user" as const,
                      ownerId: (r.owner === "anna" ? f.anna : f.ben).userId,
                    };
            const it = f.item(f.admin, {
              name: `${r.word}${r.word2}`,
              owner,
              visibility: owner.ownerKind !== "household" && r.priv ? "private" : "household",
            });
            if (r.grant) {
              const [p, level] = r.grant.split(":") as [string, "view" | "use" | "edit"];
              setItemGrant(f.db, f.admin, {
                itemId: it.id,
                principalKind: p === "kinder" ? "group" : "user",
                principalId:
                  p === "kinder" ? f.group.id : p === "gast" ? f.gast.userId : f.anna.userId,
                level,
              });
            }
          }
          const all = f.db.select().from(items).all();
          const grants = f.db.select().from(itemGrants).all();
          const nq = normalizeSearchText(q);
          const expected = all
            .filter(
              (it) =>
                itemLevel(
                  ctx,
                  it,
                  grants.filter((g) => g.itemId === it.id),
                ) !== "none",
            )
            .filter((it) => {
              const n = normalizeSearchText(it.name);
              if (!nq) return true;
              return nq.length >= 3 ? n.includes(nq) : n.startsWith(nq) || n.includes(` ${nq}`);
            })
            .map((it) => it.id)
            .sort();
          const page = searchItems(f.db, ctx, { q, limit: 200 });
          expect(page.items.map((r) => r.id).sort()).toEqual(expected);
          expect(page.total).toBe(expected.length);
          const facets = searchFacets(f.db, ctx, { q });
          expect(facets.statuses.reduce((s, x) => s + x.count, 0)).toBe(expected.length);
        },
      ),
      { numRuns: 60 },
    );
  });
});

describe("facets", () => {
  test("counts per dimension, excluding the dimension's own filter", () => {
    const { f, loc } = world();
    const facets = searchFacets(f.db, f.anna, { typeId: f.power.id });
    const type = (id: string) => facets.types.find((t) => t.id === id)!;
    expect(type(f.power.id).count).toBe(1);
    expect(type(f.tool.id).count).toBe(6);
    expect(type(f.tool.id).total).toBe(7); // incl. the subtype
    expect(facets.statuses.find((s) => s.status === "available")!.count).toBe(1);
    expect(facets.locations.find((l) => l.id === loc.garage.id)!.count).toBe(1);
    expect(facets.attributes!.map((a) => a.key)).toContain("battery");

    const tool = searchFacets(f.db, f.anna, { typeId: f.tool.id, includeGone: true });
    const season = tool.attributes!.find((a) => a.key === "season")!;
    expect(season.values).toEqual([
      { value: "Sommer", label: "Sommer", count: 1 },
      { value: "Winter", label: "Winter", count: 2 },
    ]);
    const size = tool.attributes!.find((a) => a.key === "size")!;
    expect(size.values!.find((v) => v.value === "128")!.count).toBe(2);
    expect(tool.attributes!.find((a) => a.key === "voltage")!.range).toEqual({ min: 18, max: 18 });
    expect(tool.attributes!.find((a) => a.key === "keeper")!.values![0]!.label).toBe("Ben");
    const gone = searchFacets(f.db, f.anna, {}).statuses.find((s) => s.status === "given_away")!;
    expect(gone).toEqual({ status: "given_away", gone: true, count: 1 });
    expect(searchFacets(f.db, f.anna, {}).priceAvailable).toBe(true);
    expect(searchFacets(f.db, f.gast, {}).priceAvailable).toBe(false);
  });

  test("location totals include sub-locations; guests only see locations of visible items", () => {
    const { f, ids, loc } = world();
    const all = searchFacets(f.db, f.anna, {});
    expect(all.locations.find((l) => l.id === loc.house.id)!.total).toBe(3);
    expect(searchFacets(f.db, f.gast, {}).locations).toEqual([]);
    setItemGrant(f.db, f.admin, {
      itemId: ids.saege,
      principalKind: "user",
      principalId: f.gast.userId,
      level: "view",
    });
    const g = searchFacets(f.db, f.gast, {});
    expect(g.locations.map((l) => l.name).sort()).toEqual(["Garage", "Haus", "Regal 2"]);
    expect(g.locations.find((l) => l.id === loc.house.id)!.total).toBe(1);
  });

  test("moving an item updates location filters", () => {
    const { f, ids, loc } = world();
    const v = f.db.select().from(items).where(eq(items.id, ids.box)).get()!.version;
    moveItem(f.db, f.anna, { id: ids.box, version: v, locationId: loc.cellar.id });
    // The saw inside the box moves with it.
    expect(names(f, f.anna, { locationId: loc.cellar.id })).toEqual([
      "Stichsäge",
      "Straßenbesen",
      "Werkzeugkiste",
    ]);
    updateItem(f.db, f.anna, { id: ids.box, version: v + 1, name: "Kiste" });
    expect(names(f, f.anna, { q: "werkzeugkiste" })).toEqual([]);
  });
});
