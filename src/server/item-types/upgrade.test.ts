import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { parseStoredFields } from "../../lib/item-types/fields";
import { events, itemRelations, items, itemTypes } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { setupFixture } from "../items/test-fixtures";
import { seedStarterTemplates } from "./seed";
import { createItemType } from "./service";
import { upgradeStarterTypes } from "./upgrade";

/** The starter types as v1.1 seeded them. */
function oldInstance() {
  const f = setupFixture();
  const base = { icon: null, parentId: null } as const;
  const electronics = createItemType(f.db, f.admin, {
    ...base,
    key: "electronics",
    name: "Elektronik",
    tracking: "individual",
    fields: [
      { key: "brand", label: "Marke", kind: "text" },
      { key: "warranty_until", label: "Garantie bis", kind: "date", help: "Erinnerung" },
    ],
  });
  const spare = createItemType(f.db, f.admin, {
    ...base,
    key: "spare_part",
    name: "Ersatzteil",
    tracking: "stock",
    fields: [
      { key: "part_number", label: "Teilenummer", kind: "text" },
      { key: "fits", label: "Passt zu", kind: "item", multiple: true },
    ],
  });
  const filter = createItemType(f.db, f.admin, {
    ...base,
    key: "filter",
    name: "Filter",
    tracking: "stock",
    parentId: spare.id,
    fields: [],
  });
  const vacuum = f.item(f.admin, { name: "Staubsauger" });
  const drill = f.item(f.admin, { name: "Bohrmaschine" });
  const bag = f.item(f.admin, {
    typeId: spare.id,
    name: "Beutel",
    attributes: { part_number: "B-12", fits: [vacuum.id, drill.id] },
  });
  const hepa = f.item(f.admin, {
    typeId: filter.id,
    name: "HEPA-Filter",
    attributes: { fits: [vacuum.id] },
  });
  // A reference to an item deleted in the meantime.
  f.db.delete(items).where(eq(items.id, drill.id)).run();
  return { ...f, electronics, spare, filter, vacuum, bag, hepa };
}

const fieldsOf = (f: ReturnType<typeof oldInstance>, id: string) =>
  parseStoredFields(
    f.db.select({ fields: itemTypes.fields }).from(itemTypes).where(eq(itemTypes.id, id)).get()
      ?.fields,
  );

describe("starter type upgrade for v1.2", () => {
  test("warranty flag, fits values become relations, the field is hidden; once only", () => {
    const f = oldInstance();
    expect(upgradeStarterTypes(f.db)).toEqual({ warranty: true, fitsItems: 2, fitsRelations: 2 });

    expect(fieldsOf(f, f.electronics.id).find((x) => x.key === "warranty_until")).toMatchObject({
      kind: "date",
      warranty: true,
    });
    expect(fieldsOf(f, f.spare.id).find((x) => x.key === "fits")).toMatchObject({ hidden: true });

    const rels = f.db.select().from(itemRelations).all();
    expect(rels.map((r) => [r.fromItemId, r.toItemId, r.kind]).sort()).toEqual(
      [
        [f.bag.id, f.vacuum.id, "fits"],
        [f.hepa.id, f.vacuum.id, "fits"],
      ].sort(),
    );
    const bag = f.db.select().from(items).where(eq(items.id, f.bag.id)).get();
    expect(bag?.attributes).toEqual({ part_number: "B-12" });
    expect(bag?.version).toBe(f.bag.version + 1);
    const migrated = f.db
      .select()
      .from(events)
      .where(eq(events.action, "item.attributes_migrated"))
      .all();
    expect(migrated.map((e) => e.itemId).sort()).toEqual([f.bag.id, f.hepa.id].sort());

    expect(upgradeStarterTypes(f.db)).toBeNull();
    expect(f.db.select().from(itemRelations).all()).toHaveLength(2);
  });

  test("a fresh instance has nothing to upgrade", () => {
    const db = createTestDb();
    seedStarterTemplates(db);
    expect(upgradeStarterTypes(db)).toEqual({ warranty: false, fitsItems: 0, fitsRelations: 0 });
  });
});
