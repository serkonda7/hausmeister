import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { events, items, tags } from "../db/schema";
import { ItemsError } from "../items/errors";
import { getItem, updateItem } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import {
  attachTag,
  deleteTag,
  detachTag,
  listTags,
  mergeTags,
  recolorTag,
  renameTag,
} from "./service";

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

const v = (f: ReturnType<typeof setupFixture>, id: string) =>
  f.db.select({ v: items.version }).from(items).where(eq(items.id, id)).get()!.v;

describe("tags on items", () => {
  test("attach creates by name (case-insensitive reuse), detach removes; both need edit", () => {
    const f = setupFixture();
    const a = f.item(f.anna, {
      name: "Rechen",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    const r = attachTag(f.db, f.anna, { itemId: a.id, version: 1, name: "Garten" });
    expect(r.version).toBe(2);
    const again = attachTag(f.db, f.anna, { itemId: a.id, version: 2, name: "garten" });
    expect(again).toEqual({ version: 2, tagId: r.tagId }); // already there: no change
    expect(f.db.select().from(tags).all()).toHaveLength(1);
    expect(code(() => attachTag(f.db, f.ben, { itemId: a.id, version: 2, name: "x" }))).toBe(
      "ITEM_FORBIDDEN",
    );
    expect(code(() => attachTag(f.db, f.gast, { itemId: a.id, version: 2, name: "x" }))).toBe(
      "ITEM_NOT_FOUND",
    );
    expect(detachTag(f.db, f.anna, { itemId: a.id, version: 2, tagId: r.tagId })).toEqual({
      version: 3,
    });
    const diffs = f.db
      .select()
      .from(events)
      .where(eq(events.itemId, a.id))
      .all()
      .filter((e) => e.action === "item.updated")
      .map((e) => e.diff);
    expect(diffs).toEqual([
      { tags: { from: [], to: ["Garten"] } },
      { tags: { from: ["Garten"], to: [] } },
    ]);
    expect(
      f.db
        .select()
        .from(events)
        .all()
        .some((e) => e.action === "tag.created"),
    ).toBe(true);
  });
});

describe("listing", () => {
  test("counts visible items; tags used only on invisible items are hidden from others", () => {
    const f = setupFixture();
    f.item(f.anna, { name: "a", tags: ["Werkstatt"] });
    f.item(f.anna, {
      name: "b",
      tags: ["Geschenk für Ben", "Werkstatt"],
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const unused = f.item(f.anna, { name: "c", tags: ["Leer"] });
    updateItem(f.db, f.anna, { id: unused.id, version: 1, tags: [] });
    const show = (ctx: typeof f.anna) => listTags(f.db, ctx).map((t) => `${t.name}:${t.count}`);
    expect(show(f.anna)).toEqual(["Geschenk für Ben:1", "Leer:0", "Werkstatt:2"]);
    expect(show(f.ben)).toEqual(["Leer:0", "Werkstatt:1"]);
    expect(show(f.admin)).toEqual(["Geschenk für Ben:1", "Leer:0", "Werkstatt:2"]);
    expect(show(f.gast)).toEqual(["Leer:0"]);
  });
});

describe("matching names against hidden tags", () => {
  function hiddenTag() {
    const f = setupFixture();
    f.item(f.anna, {
      name: "Ring",
      tags: ["Verlobung-Geheim"],
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const secret = f.db.select().from(tags).where(eq(tags.name, "Verlobung-Geheim")).get()!;
    recolorTag(f.db, f.admin, { id: secret.id, color: "#cc0000" });
    const mine = f.item(f.ben, {
      name: "Bens Kiste",
      owner: { ownerKind: "user", ownerId: f.ben.userId },
    });
    return { f, secret, mine };
  }
  const tagsOf = (f: ReturnType<typeof setupFixture>, ctx: typeof f.ben, id: string) =>
    getItem(f.db, ctx, id).tags.map((t) => `${t.name}:${t.color ?? "-"}`);

  test("attachTag with a case variant does not reveal the hidden spelling or colour", () => {
    const { f, secret, mine } = hiddenTag();
    const r = attachTag(f.db, f.ben, { itemId: mine.id, version: 1, name: "verlobung-geheim" });
    expect(r.tagId).not.toBe(secret.id);
    expect(tagsOf(f, f.ben, mine.id)).toEqual(["verlobung-geheim:-"]);
    // Anna's tag is untouched and still hers alone.
    expect(f.db.select().from(tags).where(eq(tags.id, secret.id)).get()?.name).toBe(
      "Verlobung-Geheim",
    );
    expect(listTags(f.db, f.ben).some((t) => t.id === secret.id)).toBe(false);
  });

  test("updateItem with tag names behaves the same", () => {
    const { f, secret, mine } = hiddenTag();
    updateItem(f.db, f.ben, { id: mine.id, version: 1, tags: ["VERLOBUNG-GEHEIM"] });
    expect(tagsOf(f, f.ben, mine.id)).toEqual(["VERLOBUNG-GEHEIM:-"]);
    expect(listTags(f.db, f.ben).some((t) => t.id === secret.id)).toBe(false);
  });

  test("visible tags and admins still match case-insensitively", () => {
    const { f, secret, mine } = hiddenTag();
    f.item(f.anna, { name: "Spaten", tags: ["Garten"] });
    attachTag(f.db, f.ben, { itemId: mine.id, version: 1, name: "garten" });
    expect(tagsOf(f, f.ben, mine.id)).toEqual(["Garten:-"]);
    const adminItem = f.item(f.admin, { name: "Etui" });
    const r = attachTag(f.db, f.admin, {
      itemId: adminItem.id,
      version: 1,
      name: "verlobung-geheim",
    });
    expect(r.tagId).toBe(secret.id);
    // The exact spelling reuses the hidden tag (names are unique exactly): the caller typed it already.
    const again = attachTag(f.db, f.ben, { itemId: mine.id, version: 2, name: "Verlobung-Geheim" });
    expect(again.tagId).toBe(secret.id);
  });
});

describe("admin maintenance", () => {
  test("rename, recolour, merge and delete are admin-only and validated", () => {
    const f = setupFixture();
    const a = f.item(f.anna, { name: "a", tags: ["Garten", "Draußen"] });
    const b = f.item(f.anna, { name: "b", tags: ["Draussen"] });
    const id = (n: string) => f.db.select().from(tags).where(eq(tags.name, n)).get()!.id;
    expect(code(() => renameTag(f.db, f.anna, { id: id("Garten"), name: "x" }))).toBe(
      "TAG_FORBIDDEN",
    );
    expect(code(() => renameTag(f.db, f.admin, { id: id("Garten"), name: "draußen" }))).toBe(
      "TAG_NAME_TAKEN",
    );
    expect(code(() => renameTag(f.db, f.admin, { id: "nope", name: "x" }))).toBe("TAG_NOT_FOUND");
    recolorTag(f.db, f.admin, { id: id("Garten"), color: "#AABBCC" });
    expect(f.db.select().from(tags).where(eq(tags.name, "Garten")).get()!.color).toBe("#aabbcc");
    expect(
      code(() => mergeTags(f.db, f.admin, { sourceId: id("Garten"), targetId: id("Garten") })),
    ).toBe("TAG_MERGE_SELF");
    expect(mergeTags(f.db, f.admin, { sourceId: id("Draussen"), targetId: id("Draußen") })).toEqual(
      {
        items: 1,
      },
    );
    expect(listTags(f.db, f.admin).map((t) => `${t.name}:${t.count}`)).toEqual([
      "Draußen:2",
      "Garten:1",
    ]);
    expect(v(f, b.id)).toBe(2);
    expect(deleteTag(f.db, f.admin, { id: id("Draußen") })).toEqual({ items: 2 });
    expect(listTags(f.db, f.admin).map((t) => t.name)).toEqual(["Garten"]);
    expect(v(f, a.id)).toBe(2);
    const actions = f.db
      .select()
      .from(events)
      .all()
      .map((e) => e.action);
    for (const x of ["tag.recolored", "tag.merged", "tag.deleted"]) expect(actions).toContain(x);
  });
});
