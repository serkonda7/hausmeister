import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { items } from "../db/schema";
import { updateItemType } from "../item-types/service";
import {
  changeItemType,
  deleteItem,
  moveItem,
  reassignUserItems,
  updateItem,
} from "../items/service";
import { setupFixture, TOOL_FIELDS } from "../items/test-fixtures";
import { attachTag, deleteTag, detachTag, mergeTags, renameTag } from "../tags/service";
import { itemsFts } from "./fts";
import { ensureSearchIndex, rebuildSearchIndex, searchIndexOutOfStep } from "./indexer";
import { searchItems } from "./query";

type F = ReturnType<typeof setupFixture>;

const snapshot = (f: F) =>
  f.db
    .select()
    .from(itemsFts)
    .all()
    .sort((a, b) => a.itemId.localeCompare(b.itemId));

/** The incrementally maintained index equals a fresh rebuild. */
function expectConsistent(f: F) {
  expect(searchIndexOutOfStep(f.db)).toBe(false);
  const before = snapshot(f);
  const sorts = f.db.select({ id: items.id, s: items.nameSort }).from(items).all();
  rebuildSearchIndex(f.db);
  expect(snapshot(f)).toEqual(before);
  expect(f.db.select({ id: items.id, s: items.nameSort }).from(items).all()).toEqual(sorts);
}

const v = (f: F, id: string) =>
  f.db.select({ v: items.version }).from(items).where(eq(items.id, id)).get()!.v;
const found = (f: F, q: string) =>
  searchItems(f.db, f.admin, { q, includeGone: true }).items.map((r) => r.name);

describe("items_fts stays in step with every kind of write", () => {
  test("create, update, tags, type change, move, delete, reassign", () => {
    const f = setupFixture();
    const a = f.item(f.anna, {
      name: "Akkuschrauber",
      description: "grün",
      tags: ["Werkstatt"],
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    const b = f.item(f.anna, { name: "Box" });
    expectConsistent(f);
    updateItem(f.db, f.anna, {
      id: a.id,
      version: 1,
      name: "Bohrschrauber",
      attributes: { brand: "Makita" },
    });
    expect(found(f, "makita")).toEqual(["Bohrschrauber"]);
    expect(found(f, "akkuschrauber")).toEqual([]);
    expectConsistent(f);
    attachTag(f.db, f.anna, { itemId: a.id, version: v(f, a.id), name: "Garten" });
    expect(found(f, "garten")).toEqual(["Bohrschrauber"]);
    expectConsistent(f);
    const tagId = searchItems(f.db, f.anna, { q: "garten" }).items[0]!.tags.find(
      (t) => t.name === "Garten",
    )!.id;
    detachTag(f.db, f.anna, { itemId: a.id, version: v(f, a.id), tagId });
    expect(found(f, "garten")).toEqual([]);
    expectConsistent(f);
    changeItemType(f.db, f.anna, {
      id: a.id,
      version: v(f, a.id),
      typeId: f.other.id,
      confirm: true,
      attributes: { shop: "Baumarkt Süd" },
    });
    expect(found(f, "baumarkt sud")).toEqual(["Bohrschrauber"]);
    expectConsistent(f);
    moveItem(f.db, f.anna, { id: a.id, version: v(f, a.id), containerItemId: b.id });
    expectConsistent(f);
    reassignUserItems(f.db, f.admin, { fromUserId: f.anna.userId, to: { ownerKind: "household" } });
    expectConsistent(f);
    deleteItem(f.db, f.admin, { id: a.id, version: v(f, a.id) });
    expect(found(f, "bohrschrauber")).toEqual([]);
    expectConsistent(f);
  });

  test("tag rename, merge and delete reindex the tagged items", () => {
    const f = setupFixture();
    const a = f.item(f.anna, { name: "Rechen", tags: ["Gartn"] });
    const b = f.item(f.anna, { name: "Schaufel", tags: ["Garten"] });
    const tagsOf = () =>
      Object.fromEntries(
        searchItems(f.db, f.admin, {})
          .items.flatMap((r) => r.tags)
          .map((t) => [t.name, t.id]),
      );
    renameTag(f.db, f.admin, { id: tagsOf().Gartn!, name: "Gartenzeug" });
    expect(found(f, "gartenzeug")).toEqual(["Rechen"]);
    expectConsistent(f);
    mergeTags(f.db, f.admin, { sourceId: tagsOf().Gartenzeug!, targetId: tagsOf().Garten! });
    expect(found(f, "gartenzeug")).toEqual([]);
    expect(found(f, "garten").sort()).toEqual(["Rechen", "Schaufel"]);
    expectConsistent(f);
    deleteTag(f.db, f.admin, { id: tagsOf().Garten! });
    expect(found(f, "garten")).toEqual([]);
    expectConsistent(f);
    expect([v(f, a.id), v(f, b.id)]).toEqual([3, 2]);
  });

  test("attribute migrations and label changes in the item-types module reindex", () => {
    const f = setupFixture();
    f.item(f.anna, { name: "Akku", attributes: { voltage: 18, cordless: true } });
    f.item(f.anna, { name: "Laser", typeId: f.power.id, attributes: { cordless: true } });
    expect(found(f, "kabellos").sort()).toEqual(["Akku", "Laser"]);
    // Rename the boolean's label (indexed for true values) and turn voltage into text.
    const fields = TOOL_FIELDS.map((fd) =>
      fd.key === "cordless"
        ? { ...fd, label: "Akkubetrieb" }
        : fd.key === "voltage"
          ? { key: "voltage", label: "Spannung", kind: "select" as const, options: ["18"] }
          : fd,
    );
    const input = {
      id: f.tool.id,
      name: "Werkzeug",
      icon: null,
      tracking: "individual" as const,
      parentId: null,
      fields,
    };
    const preview = updateItemType(f.db, f.admin, input);
    expect(preview.status).toBe("confirm");
    updateItemType(f.db, f.admin, { ...input, confirmAffected: 1 });
    expect(found(f, "kabellos")).toEqual([]);
    expect(found(f, "akkubetrieb").sort()).toEqual(["Akku", "Laser"]); // subtype item too
    expectConsistent(f);
  });
});

describe("rebuild", () => {
  test("detects an empty or partial index and rebuilds it", () => {
    const f = setupFixture();
    f.item(f.anna, { name: "Säge" });
    const b = f.item(f.anna, { name: "Hobel" });
    expect(ensureSearchIndex(f.db)).toBe(false);
    f.db.delete(itemsFts).run();
    expect(searchIndexOutOfStep(f.db)).toBe(true);
    expect(found(f, "sage")).toEqual([]);
    expect(ensureSearchIndex(f.db)).toBe(true);
    expect(found(f, "sage")).toEqual(["Säge"]);
    // A stray row and a missing name_sort are found too.
    f.db.insert(itemsFts).values({ itemId: "ghost", name: "x" }).run();
    expect(searchIndexOutOfStep(f.db)).toBe(true);
    ensureSearchIndex(f.db);
    f.db.update(items).set({ nameSort: null }).where(eq(items.id, b.id)).run();
    expect(searchIndexOutOfStep(f.db)).toBe(true);
    ensureSearchIndex(f.db);
    expectConsistent(f);
    expect(rebuildSearchIndex(f.db)).toBe(2);
  });
});
