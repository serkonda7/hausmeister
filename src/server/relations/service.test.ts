import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { itemRelations } from "../db/schema";
import { getItemHistory } from "../history/service";
import { ItemsError } from "../items/errors";
import { deleteItem, setItemGrant } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { addItemRelation, listItemRelations, removeItemRelation } from "./service";

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

function relationFixture() {
  const f = setupFixture();
  const vacuum = f.item(f.admin, { name: "Staubsauger" });
  const bags = f.item(f.anna, {
    typeId: f.other.id,
    name: "Staubsaugerbeutel",
    owner: { ownerKind: "user", ownerId: f.anna.userId },
    quantity: 2,
    unit: "Stk.",
    minQuantity: 5,
    attributes: { shop: "Drogerie" },
  });
  const secret = f.item(f.ben, {
    name: "Bens Akku",
    owner: { ownerKind: "user", ownerId: f.ben.userId },
    visibility: "private",
  });
  return { ...f, vacuum, bags, secret };
}

describe("item relations", () => {
  test("a spare part that fits shows on both items, with stock on the device's side", () => {
    const f = relationFixture();
    addItemRelation(f.db, f.anna, { fromItemId: f.bags.id, toItemId: f.vacuum.id, kind: "fits" });

    const onVacuum = listItemRelations(f.db, f.ben, f.vacuum.id);
    expect(onVacuum.relations).toEqual([
      {
        kind: "fits",
        direction: "in",
        canRemove: true,
        other: expect.objectContaining({
          id: f.bags.id,
          name: "Staubsaugerbeutel",
          typeName: "Sonstiges",
          tracking: "stock",
          quantity: 2,
          unit: "Stk.",
          lowStock: true,
          gone: false,
        }),
      },
    ]);
    const onBags = listItemRelations(f.db, f.anna, f.bags.id);
    expect(onBags.relations.map((r) => [r.kind, r.direction, r.other.name])).toEqual([
      ["fits", "out", "Staubsauger"],
    ]);
    expect(onBags.canAdd).toBe(true);

    // Both histories tell it from their side.
    const diffs = (itemId: string) =>
      getItemHistory(f.db, f.admin, { itemId })
        .entries.filter((e) => e.action === "item.relation_added")
        .map((e) => e.diff);
    expect(diffs(f.vacuum.id)).toEqual([
      { relation: "fits", direction: "in", relatedItemId: f.bags.id },
    ]);
    expect(diffs(f.bags.id)).toEqual([
      { relation: "fits", direction: "out", relatedItemId: f.vacuum.id },
    ]);
  });

  test("a relation with an item the caller cannot see stays hidden, also in the history", () => {
    const f = relationFixture();
    addItemRelation(f.db, f.ben, {
      fromItemId: f.secret.id,
      toItemId: f.vacuum.id,
      kind: "accessory_of",
    });
    expect(listItemRelations(f.db, f.anna, f.vacuum.id).relations).toEqual([]);
    expect(listItemRelations(f.db, f.admin, f.vacuum.id).relations).toHaveLength(1);
    const actions = (ctx: typeof f.anna) =>
      getItemHistory(f.db, ctx, { itemId: f.vacuum.id }).entries.map((e) => e.action);
    expect(actions(f.anna)).not.toContain("item.relation_added");
    expect(actions(f.admin)).toContain("item.relation_added");
    // And it cannot be named: the private item answers like a missing one.
    expect(
      code(() =>
        removeItemRelation(f.db, f.anna, {
          fromItemId: f.secret.id,
          toItemId: f.vacuum.id,
          kind: "accessory_of",
        }),
      ),
    ).toBe("ITEM_NOT_FOUND");
  });

  test("adding needs both items visible and edit on one of them", () => {
    const f = relationFixture();
    // Ben's private item: Anna cannot see it, so it answers like a missing one.
    expect(
      code(() =>
        addItemRelation(f.db, f.anna, {
          fromItemId: f.bags.id,
          toItemId: f.secret.id,
          kind: "fits",
        }),
      ),
    ).toBe("ITEM_NOT_FOUND");
    // A guest with view on both items edits neither.
    for (const id of [f.vacuum.id, f.bags.id])
      setItemGrant(f.db, f.admin, {
        itemId: id,
        principalKind: "user",
        principalId: f.gast.userId,
        level: "view",
      });
    expect(
      code(() =>
        addItemRelation(f.db, f.gast, {
          fromItemId: f.bags.id,
          toItemId: f.vacuum.id,
          kind: "fits",
        }),
      ),
    ).toBe("ITEM_FORBIDDEN");
    expect(listItemRelations(f.db, f.gast, f.vacuum.id).canAdd).toBe(false);
    // Edit on the target side is enough: Anna records that the household vacuum's bags are hers.
    expect(
      code(() =>
        addItemRelation(f.db, f.anna, {
          fromItemId: f.vacuum.id,
          toItemId: f.bags.id,
          kind: "accessory_of",
        }),
      ),
    ).toBe("OK");
  });

  test("no self relations, no duplicates, no loops (fits may go both ways)", () => {
    const f = relationFixture();
    const a = f.item(f.admin, { name: "Set" });
    const b = f.item(f.admin, { name: "Koffer" });
    const c = f.item(f.admin, { name: "Bit" });
    const add = (fromItemId: string, toItemId: string, kind: "fits" | "part_of") =>
      code(() => addItemRelation(f.db, f.admin, { fromItemId, toItemId, kind }));
    expect(add(a.id, a.id, "part_of")).toBe("RELATION_SELF");
    expect(add(c.id, b.id, "part_of")).toBe("OK");
    expect(add(c.id, b.id, "part_of")).toBe("RELATION_EXISTS");
    expect(add(b.id, a.id, "part_of")).toBe("OK");
    expect(add(a.id, c.id, "part_of")).toBe("RELATION_CYCLE");
    expect(add(b.id, c.id, "part_of")).toBe("RELATION_CYCLE");
    expect(add(a.id, b.id, "fits")).toBe("OK");
    expect(add(b.id, a.id, "fits")).toBe("OK");
  });

  test("removing: edit on either side; the relation must exist; deleting an item drops its relations", () => {
    const f = relationFixture();
    const rel = { fromItemId: f.bags.id, toItemId: f.vacuum.id, kind: "fits" as const };
    addItemRelation(f.db, f.anna, rel);
    // Ben edits the household vacuum (member), not Anna's bags: enough to remove it.
    expect(listItemRelations(f.db, f.ben, f.bags.id).relations[0]?.canRemove).toBe(true);
    removeItemRelation(f.db, f.ben, rel);
    expect(code(() => removeItemRelation(f.db, f.ben, rel))).toBe("RELATION_NOT_FOUND");
    expect(
      getItemHistory(f.db, f.anna, { itemId: f.bags.id }).entries.map((e) => e.action),
    ).toContain("item.relation_removed");

    addItemRelation(f.db, f.anna, rel);
    deleteItem(f.db, f.admin, { id: f.vacuum.id, version: f.vacuum.version });
    expect(
      f.db.select().from(itemRelations).where(eq(itemRelations.fromItemId, f.bags.id)).all(),
    ).toEqual([]);
  });
});
