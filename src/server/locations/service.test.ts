import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { flattenTree } from "../../lib/item-types/tree";
import { events, items, locations } from "../db/schema";
import { ItemsError } from "../items/errors";
import { getItem, moveItem, resolveShortCode, setItemGrant } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { searchItems } from "../search/query";
import {
  createLocation,
  deleteLocation,
  getLocation,
  listLocations,
  moveLocation,
  updateLocation,
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

function tree() {
  const f = setupFixture();
  const house = createLocation(f.db, f.anna, { name: "Haus", kind: "building" });
  const garage = createLocation(f.db, f.anna, { name: "Garage", parentId: house.id, kind: "room" });
  const shelf = createLocation(f.db, f.ben, {
    name: "Regal 2",
    parentId: garage.id,
    kind: "shelf",
  });
  const attic = createLocation(f.db, f.admin, { name: "Dachboden", parentId: house.id });
  return { f, house, garage, shelf, attic };
}

describe("rights", () => {
  test("admins and members create and edit, guests do not", () => {
    const { f, garage } = tree();
    expect(code(() => createLocation(f.db, f.gast, { name: "x" }))).toBe("LOCATION_FORBIDDEN");
    expect(code(() => updateLocation(f.db, f.gast, { id: garage.id, name: "x" }))).toBe(
      "LOCATION_FORBIDDEN",
    );
    expect(code(() => deleteLocation(f.db, f.gast, { id: garage.id }))).toBe("LOCATION_FORBIDDEN");
    updateLocation(f.db, f.ben, { id: garage.id, name: "Carport", notes: "links", kind: "area" });
    const row = f.db.select().from(locations).where(eq(locations.id, garage.id)).get()!;
    expect([row.name, row.notes, row.kind]).toEqual(["Carport", "links", "area"]);
    expect(row.shortCode).toMatch(/^[A-Z2-9]{6}$/);
    const ev = f.db
      .select()
      .from(events)
      .all()
      .filter((e) => e.action.startsWith("location."));
    expect(ev.map((e) => e.action)).toEqual([
      "location.created",
      "location.created",
      "location.created",
      "location.created",
      "location.updated",
    ]);
  });

  test("sibling names are unique (ignoring case); the same name elsewhere is fine", () => {
    const { f, house, garage } = tree();
    expect(code(() => createLocation(f.db, f.anna, { name: "garage", parentId: house.id }))).toBe(
      "LOCATION_NAME_TAKEN",
    );
    expect(code(() => createLocation(f.db, f.anna, { name: "Garage", parentId: garage.id }))).toBe(
      "OK",
    );
    expect(code(() => createLocation(f.db, f.anna, { name: "x", parentId: "nope" }))).toBe(
      "LOCATION_NOT_FOUND",
    );
  });
});

describe("tree and moves", () => {
  test("moves without cycles", () => {
    const { f, house, garage, shelf, attic } = tree();
    expect(code(() => moveLocation(f.db, f.anna, { id: house.id, parentId: shelf.id }))).toBe(
      "LOCATION_CYCLE",
    );
    expect(code(() => moveLocation(f.db, f.anna, { id: garage.id, parentId: garage.id }))).toBe(
      "LOCATION_CYCLE",
    );
    moveLocation(f.db, f.anna, { id: shelf.id, parentId: attic.id });
    const nodes = flattenTree(listLocations(f.db, f.anna));
    expect(nodes.map((n) => [n.name, n.depth])).toEqual([
      ["Haus", 0],
      ["Dachboden", 1],
      ["Regal 2", 2],
      ["Garage", 1],
    ]);
    expect(getLocation(f.db, f.anna, shelf.id).path.map((p) => p.name)).toEqual([
      "Haus",
      "Dachboden",
    ]);
  });

  test("counts only include visible items", () => {
    const { f, house, garage, shelf } = tree();
    f.item(f.anna, { name: "Säge", locationId: shelf.id });
    f.item(f.anna, {
      name: "Geheim",
      locationId: garage.id,
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const byName = (ctx: typeof f.anna) =>
      Object.fromEntries(
        flattenTree(listLocations(f.db, ctx)).map((n) => [n.name, [n.itemCount, n.totalCount]]),
      );
    expect(byName(f.anna)).toMatchObject({ Haus: [0, 2], Garage: [1, 2], "Regal 2": [1, 1] });
    expect(byName(f.ben)).toMatchObject({ Haus: [0, 1], Garage: [0, 1], "Regal 2": [1, 1] });
    const d = getLocation(f.db, f.ben, house.id);
    expect(d.totalCount).toBe(1);
    expect(d.children.map((c) => c.name)).toEqual(["Dachboden", "Garage"]);
  });
});

describe("guests", () => {
  test("see only the locations on the path of items shared with them", () => {
    const { f, garage, shelf, attic } = tree();
    expect(listLocations(f.db, f.gast)).toEqual([]);
    expect(code(() => getLocation(f.db, f.gast, garage.id))).toBe("LOCATION_NOT_FOUND");
    const loc = f.db.select().from(locations).where(eq(locations.id, attic.id)).get()!;
    expect(code(() => resolveShortCode(f.db, f.gast, loc.shortCode!))).toBe("SHORT_CODE_NOT_FOUND");
    const it = f.item(f.anna, {
      name: "Bilderbuch",
      locationId: shelf.id,
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    setItemGrant(f.db, f.anna, {
      itemId: it.id,
      principalKind: "user",
      principalId: f.gast.userId,
      level: "view",
    });
    expect(flattenTree(listLocations(f.db, f.gast)).map((n) => n.name)).toEqual([
      "Haus",
      "Garage",
      "Regal 2",
    ]);
    expect(getLocation(f.db, f.gast, shelf.id).path.map((p) => p.name)).toEqual(["Haus", "Garage"]);
    expect(code(() => getLocation(f.db, f.gast, attic.id))).toBe("LOCATION_NOT_FOUND");
    expect(getLocation(f.db, f.gast, shelf.id).canEdit).toBe(false);
  });
});

describe("delete", () => {
  test("members delete only empty locations; admins move the contents up", () => {
    const { f, house, garage, shelf, attic } = tree();
    const it = f.item(f.anna, {
      name: "Geheim",
      locationId: shelf.id,
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    // Ben cannot see the item, but the shelf is still not empty for him.
    expect(getLocation(f.db, f.ben, shelf.id).canDelete).toBe(false);
    expect(code(() => deleteLocation(f.db, f.ben, { id: shelf.id }))).toBe("LOCATION_NOT_EMPTY");
    expect(code(() => deleteLocation(f.db, f.ben, { id: garage.id }))).toBe("LOCATION_NOT_EMPTY");
    expect(getLocation(f.db, f.ben, attic.id).canDelete).toBe(true);
    expect(deleteLocation(f.db, f.ben, { id: attic.id })).toEqual({
      movedItems: 0,
      movedLocations: 0,
    });
    expect(deleteLocation(f.db, f.admin, { id: garage.id })).toEqual({
      movedItems: 0,
      movedLocations: 1,
    });
    expect(f.db.select().from(locations).where(eq(locations.id, shelf.id)).get()!.parentId).toBe(
      house.id,
    );
    expect(deleteLocation(f.db, f.admin, { id: shelf.id })).toEqual({
      movedItems: 1,
      movedLocations: 0,
    });
    const row = f.db.select().from(items).where(eq(items.id, it.id)).get()!;
    expect([row.locationId, row.version]).toEqual([house.id, 2]);
    const ev = f.db.select().from(events).where(eq(events.itemId, it.id)).all().at(-1)!;
    expect(ev.diff).toEqual({
      locationId: { from: shelf.id, to: house.id },
      reason: "location_deleted",
    });
  });
});

describe("containers and breadcrumbs", () => {
  test("container cycles are refused; contents follow their container", () => {
    const { f, garage, attic } = tree();
    const box = f.item(f.anna, { name: "Kiste", locationId: garage.id });
    const bag = f.item(f.anna, { name: "Beutel", containerItemId: box.id });
    const nail = f.item(f.anna, { name: "Nagel", containerItemId: bag.id });
    expect(f.db.select().from(items).where(eq(items.id, nail.id)).get()!.locationId).toBe(
      garage.id,
    );
    expect(
      code(() => moveItem(f.db, f.anna, { id: box.id, version: 1, containerItemId: nail.id })),
    ).toBe("CONTAINER_CYCLE");
    expect(
      code(() => moveItem(f.db, f.anna, { id: box.id, version: 1, containerItemId: box.id })),
    ).toBe("CONTAINER_CYCLE");
    moveItem(f.db, f.anna, { id: box.id, version: 1, locationId: attic.id });
    for (const id of [bag.id, nail.id])
      expect(f.db.select().from(items).where(eq(items.id, id)).get()!.locationId).toBe(attic.id);
    expect(getItem(f.db, f.anna, nail.id).path.map((c) => ("name" in c ? c.name : "?"))).toEqual([
      "Haus",
      "Dachboden",
      "Kiste",
      "Beutel",
    ]);
    // Taking the bag out of the box: a location clears the container.
    moveItem(f.db, f.anna, { id: bag.id, version: v(f, bag.id), locationId: garage.id });
    const bagRow = f.db.select().from(items).where(eq(items.id, bag.id)).get()!;
    expect([bagRow.containerItemId, bagRow.locationId]).toEqual([null, garage.id]);
    expect(f.db.select().from(items).where(eq(items.id, nail.id)).get()!.locationId).toBe(
      garage.id,
    );
    expect(getItem(f.db, f.anna, box.id).contentsCount).toBe(0);
    expect(getItem(f.db, f.anna, bag.id).contentsCount).toBe(1);
  });

  test("invisible containers become one hidden step and leak no name or count", () => {
    const { f, shelf } = tree();
    const mine = { ownerKind: "user" as const, ownerId: f.anna.userId };
    const outer = f.item(f.anna, {
      name: "Annas Truhe",
      locationId: shelf.id,
      owner: mine,
      visibility: "private",
    });
    const inner = f.item(f.anna, {
      name: "Annas Schatulle",
      containerItemId: outer.id,
      owner: mine,
      visibility: "private",
    });
    const visibleBox = f.item(f.anna, { name: "Dose", containerItemId: inner.id });
    const ring = f.item(f.anna, { name: "Ring", containerItemId: visibleBox.id });
    const benView = getItem(f.db, f.ben, ring.id);
    expect(benView.path).toEqual([
      expect.objectContaining({ kind: "location", name: "Haus" }),
      expect.objectContaining({ kind: "location", name: "Garage" }),
      expect.objectContaining({ kind: "location", name: "Regal 2" }),
      { kind: "hidden" },
      expect.objectContaining({ kind: "item", name: "Dose" }),
    ]);
    const dose = getItem(f.db, f.ben, visibleBox.id);
    expect(dose.item.containerItemId).toBeNull();
    expect(JSON.stringify([benView, dose])).not.toMatch(/Truhe|Schatulle/);
    expect(JSON.stringify([benView, dose])).not.toContain(outer.id);
    expect(getItem(f.db, f.anna, ring.id).path.filter((c) => c.kind === "item")).toHaveLength(3);
    // Contents and counts of the location only count what Ben sees.
    expect(searchItems(f.db, f.ben, { locationId: shelf.id }).total).toBe(2);
    expect(searchItems(f.db, f.anna, { locationId: shelf.id }).total).toBe(4);
    expect(searchItems(f.db, f.ben, { containerId: inner.id }).items.map((r) => r.name)).toEqual([
      "Dose",
    ]);
    expect(getItem(f.db, f.ben, visibleBox.id).contentsCount).toBe(1);
  });
});
