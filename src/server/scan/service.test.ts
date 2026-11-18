import { describe, expect, test } from "bun:test";
import { createItemType } from "../item-types/service";
import { ItemsError } from "../items/errors";
import { setupFixture } from "../items/test-fixtures";
import { getLabels } from "../labels/service";
import { createLocation } from "../locations/service";
import { lookupCode } from "./service";

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

function scanFixture() {
  const f = setupFixture();
  const book = createItemType(f.db, f.admin, {
    key: "book",
    name: "Buch",
    icon: null,
    tracking: "individual",
    parentId: null,
    fields: [{ key: "isbn", label: "ISBN", kind: "isbn" }],
  });
  const drill = f.item(f.admin, { name: "Bohrmaschine", barcode: "4006381333931" });
  const novel = f.item(f.admin, {
    name: "Roman",
    typeId: book.id,
    attributes: { isbn: "316148410X" },
  });
  const secret = f.item(f.anna, {
    name: "Geheim",
    owner: { ownerKind: "user", ownerId: f.anna.userId },
    visibility: "private",
    barcode: "4006381333931",
  });
  const shelf = createLocation(f.db, f.admin, { name: "Regal" });
  return { ...f, drill, novel, secret, shelf };
}

describe("lookupCode", () => {
  test("labels: short codes and label URLs open the item or location", () => {
    const f = scanFixture();
    expect(lookupCode(f.db, f.ben, f.drill.shortCode)).toEqual({ kind: "item", id: f.drill.id });
    expect(lookupCode(f.db, f.ben, `https://sub.example.de/q/${f.shelf.shortCode}`)).toEqual({
      kind: "location",
      id: f.shelf.id,
    });
    expect(code(() => lookupCode(f.db, f.ben, `https://x.de/q/${f.secret.shortCode}`))).toBe(
      "SHORT_CODE_NOT_FOUND",
    );
  });

  test("barcodes and ISBNs find the visible items carrying them", () => {
    const f = scanFixture();
    const ean = lookupCode(f.db, f.ben, "4006381333931");
    expect(ean.kind === "matches" && ean.items.map((i) => i.name)).toEqual(["Bohrmaschine"]);
    const asAnna = lookupCode(f.db, f.anna, "4006381333931");
    expect(asAnna.kind === "matches" && asAnna.items.map((i) => i.name).sort()).toEqual([
      "Bohrmaschine",
      "Geheim",
    ]);
    // The barcode on the book is the ISBN-13; the item stores the ISBN-10.
    const isbn = lookupCode(f.db, f.ben, "9783161484100");
    expect(isbn).toMatchObject({ kind: "matches", isbn: "9783161484100" });
    expect(isbn.kind === "matches" && isbn.items.map((i) => i.name)).toEqual(["Roman"]);
    const none = lookupCode(f.db, f.ben, "9780306406157");
    expect(none).toMatchObject({ kind: "matches", isbn: "9780306406157", items: [] });
    expect(lookupCode(f.db, f.ben, "ABC-123")).toMatchObject({ isbn: null, items: [] });
  });
});

describe("getLabels", () => {
  test("visible items and locations, in the order asked, locations first", () => {
    const f = scanFixture();
    const sheet = getLabels(f.db, f.ben, "https://sub.example.de", {
      itemIds: [f.novel.id, f.secret.id, f.drill.id, "missing"],
      locationIds: [f.shelf.id],
    });
    expect(sheet.origin).toBe("https://sub.example.de");
    expect(sheet.labels.map((l) => [l.kind, l.name, l.context])).toEqual([
      ["location", "Regal", ""],
      ["item", "Roman", "Buch"],
      ["item", "Bohrmaschine", "Werkzeug"],
    ]);
    // Guests see no locations without a shared item in them.
    expect(getLabels(f.db, f.gast, "o", { locationIds: [f.shelf.id] }).labels).toEqual([]);
  });
});
