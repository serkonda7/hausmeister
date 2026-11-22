import { describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { isoDayInBerlin } from "../../lib/format";
import { addDays } from "../../lib/warranty";
import { notifications } from "../db/schema";
import { createItemType, updateItemType } from "../item-types/service";
import { setItemGrant, setItemStatus, updateItem } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { markNotificationsRead } from "../notifications/service";
import { searchItems } from "../search/query";
import { sendWarrantyNotices, warrantyKeysByType } from "./reminders";

const TODAY = "2026-11-18";

function warrantyFixture() {
  const f = setupFixture();
  const electronics = createItemType(f.db, f.admin, {
    key: "electronics",
    name: "Elektronik",
    icon: null,
    tracking: "individual",
    parentId: null,
    fields: [
      { key: "brand", label: "Marke", kind: "text" },
      { key: "warranty_until", label: "Garantie bis", kind: "date", warranty: true },
    ],
  });
  const phone = createItemType(f.db, f.admin, {
    key: "phone",
    name: "Telefon",
    icon: null,
    tracking: "individual",
    parentId: electronics.id,
    fields: [],
  });
  const item = (ctx: typeof f.admin, name: string, until: string, extra = {}) =>
    f.item(ctx, {
      typeId: electronics.id,
      name,
      attributes: { warranty_until: until },
      ...extra,
    });
  const noticesOf = (userId: string) =>
    f.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.kind, "warranty.ending")))
      .all();
  return { ...f, electronics, phone, item, noticesOf };
}

describe("warranty reminders", () => {
  test("managers hear about it once, 30 days ahead; others and gone items not", () => {
    const f = warrantyFixture();
    const tv = f.item(f.admin, "Fernseher", addDays(TODAY, 10));
    const fridge = f.item(f.admin, "Kühlschrank", addDays(TODAY, 31));
    f.item(f.admin, "Alter Toaster", addDays(TODAY, -1));
    const laptop = f.item(f.anna, "Annas Laptop", addDays(TODAY, 30), {
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    setItemGrant(f.db, f.anna, {
      itemId: laptop.id,
      principalKind: "user",
      principalId: f.ben.userId,
      level: "manage",
    });
    const sold = f.item(f.admin, "Verkaufte Kamera", addDays(TODAY, 5));
    setItemStatus(f.db, f.admin, { id: sold.id, version: sold.version, status: "sold" });

    // Household TV: the admins; Anna's laptop: Anna and her manage grantee Ben.
    expect(sendWarrantyNotices(f.db, TODAY)).toBe(3);
    expect(f.noticesOf(f.admin.userId).map((n) => [n.itemId, n.payload])).toEqual([
      [tv.id, { until: addDays(TODAY, 10), field: "warranty_until" }],
    ]);
    expect(f.noticesOf(f.anna.userId).map((n) => n.itemId)).toEqual([laptop.id]);
    expect(f.noticesOf(f.ben.userId).map((n) => n.itemId)).toEqual([laptop.id]);

    // Read or not, a later run repeats nothing; the next day only the fridge enters the window.
    markNotificationsRead(f.db, f.anna, {});
    expect(sendWarrantyNotices(f.db, TODAY)).toBe(0);
    expect(sendWarrantyNotices(f.db, addDays(TODAY, 1))).toBe(1);
    expect(f.noticesOf(f.admin.userId).map((n) => n.itemId)).toEqual([tv.id, fridge.id]);

    // A new end date is a new notice.
    updateItem(f.db, f.anna, {
      id: laptop.id,
      version: laptop.version,
      attributes: { warranty_until: addDays(TODAY, 20) },
    });
    expect(sendWarrantyNotices(f.db, TODAY)).toBe(2);
  });

  test("inherited warranty fields count; hidden ones do not", () => {
    const f = warrantyFixture();
    const phone = f.item(f.admin, "Telefon", addDays(TODAY, 3), { typeId: f.phone.id });
    expect(sendWarrantyNotices(f.db, TODAY)).toBe(1);
    expect(f.noticesOf(f.admin.userId)[0]?.itemId).toBe(phone.id);

    const keys = warrantyKeysByType([
      {
        id: "a",
        parentId: null,
        fields: [{ key: "w", kind: "date", warranty: true, hidden: true }],
      },
      { id: "b", parentId: "a", fields: [{ key: "x", kind: "date", warranty: true }] },
      { id: "c", parentId: null, fields: [{ key: "y", kind: "text", warranty: true }] },
    ]);
    expect([...keys]).toEqual([["b", ["x"]]]);

    const r = updateItemType(f.db, f.admin, {
      id: f.electronics.id,

      name: "Elektronik",
      icon: null,
      tracking: "individual",
      parentId: null,
      fields: [
        { key: "brand", label: "Marke", kind: "text" },
        { key: "warranty_until", label: "Garantie bis", kind: "date" },
      ],
    });
    expect(r.status).toBe("saved");
    f.item(f.admin, "Radio", addDays(TODAY, 3));
    expect(sendWarrantyNotices(f.db, TODAY)).toBe(0);
  });

  test("the list filter finds visible items whose warranty ends within 30 days", () => {
    const f = warrantyFixture();
    const today = isoDayInBerlin();
    const soon = f.item(f.admin, "Fernseher", addDays(today, 2));
    f.item(f.admin, "Kühlschrank", addDays(today, 40));
    f.item(f.ben, "Bens Konsole", addDays(today, 1), {
      owner: { ownerKind: "user", ownerId: f.ben.userId },
      visibility: "private",
    });
    const names = (ctx: typeof f.anna) =>
      searchItems(f.db, ctx, { warrantyEnding: true }).items.map((r) => r.name);
    expect(names(f.anna)).toEqual(["Fernseher"]);
    expect(names(f.admin).sort()).toEqual(["Bens Konsole", "Fernseher"]);
    expect(searchItems(f.db, f.anna, { warrantyEnding: true }).items[0]?.id).toBe(soon.id);
  });
});
