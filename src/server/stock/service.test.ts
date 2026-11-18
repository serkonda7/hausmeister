import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { events, items, notifications, stockMoves } from "../db/schema";
import { ItemsError } from "../items/errors";
import { updateItem } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { listNotifications, markNotificationsRead, unreadCount } from "../notifications/service";
import { adjustStock } from "./service";

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

function stockFixture() {
  const f = setupFixture();
  const screws = f.item(f.admin, {
    name: "Schrauben M6",
    typeId: f.other.id,
    attributes: { shop: "Baumarkt" },
    quantity: 10,
    minQuantity: 5,
    unit: "Stk",
  });
  return { ...f, screws };
}

describe("adjustStock", () => {
  test("delta and count change the quantity, write the ledger and an event", () => {
    const f = stockFixture();
    const r = adjustStock(f.db, f.anna, { id: f.screws.id, delta: -2, reason: "used" });
    expect(r).toMatchObject({ quantity: 8, lowStock: false });
    const c = adjustStock(f.db, f.anna, { id: f.screws.id, quantity: 12, reason: "counted" });
    expect(c.quantity).toBe(12);
    expect(c.version).toBe(r.version + 1);
    const moves = f.db.select().from(stockMoves).where(eq(stockMoves.itemId, f.screws.id)).all();
    expect(moves.map((x) => [x.delta, x.quantityAfter, x.reason])).toEqual([
      [-2, 8, "used"],
      [4, 12, "counted"],
    ]);
    const evs = f.db
      .select()
      .from(events)
      .where(eq(events.action, "item.stock_adjusted"))
      .all()
      .map((e) => e.diff);
    expect(evs[0]).toEqual({ quantity: { from: 10, to: 8 }, reason: "used" });
  });

  test("needs use; invisible is not found; never below zero", () => {
    const f = stockFixture();
    const priv = f.item(f.anna, {
      name: "Privat",
      typeId: f.other.id,
      attributes: { shop: "x" },
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    expect(
      code(() => adjustStock(f.db, f.gast, { id: f.screws.id, delta: -1, reason: "used" })),
    ).toBe("ITEM_NOT_FOUND");
    expect(code(() => adjustStock(f.db, f.ben, { id: priv.id, delta: -1, reason: "used" }))).toBe(
      "ITEM_NOT_FOUND",
    );
    const shared = f.item(f.anna, {
      name: "Geteilt",
      typeId: f.other.id,
      attributes: { shop: "x" },
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    expect(code(() => adjustStock(f.db, f.ben, { id: shared.id, delta: -1, reason: "used" }))).toBe(
      "ITEM_FORBIDDEN",
    );
    expect(
      code(() => adjustStock(f.db, f.anna, { id: f.screws.id, delta: -11, reason: "used" })),
    ).toBe("STOCK_NEGATIVE");
    expect(code(() => adjustStock(f.db, f.anna, { id: f.screws.id, reason: "used" }))).toBe(
      "INVALID_INPUT",
    );
  });

  test("float noise is rounded away", () => {
    const f = stockFixture();
    adjustStock(f.db, f.anna, { id: f.screws.id, quantity: 0.1, reason: "counted" });
    const r = adjustStock(f.db, f.anna, { id: f.screws.id, delta: 0.2, reason: "restocked" });
    expect(r.quantity).toBe(0.3);
  });
});

describe("low-stock alerts", () => {
  test("crossing below the minimum notifies the owners once, except the actor", () => {
    const f = stockFixture();
    // Household item: every active admin and member hears about it.
    adjustStock(f.db, f.anna, { id: f.screws.id, delta: -6, reason: "used" });
    expect(unreadCount(f.db, f.anna)).toBe(0);
    expect(unreadCount(f.db, f.ben)).toBe(1);
    expect(unreadCount(f.db, f.admin)).toBe(1);
    expect(unreadCount(f.db, f.gast)).toBe(0);
    // Still low: no second notice.
    adjustStock(f.db, f.ben, { id: f.screws.id, delta: -1, reason: "used" });
    expect(unreadCount(f.db, f.admin)).toBe(1);
    const page = listNotifications(f.db, f.admin);
    expect(page.entries[0]).toMatchObject({
      kind: "stock.low",
      read: false,
      item: { id: f.screws.id, name: "Schrauben M6" },
      payload: { quantity: 4, minQuantity: 5, unit: "Stk" },
    });
  });

  test("restocking withdraws unread notices; read ones stay", () => {
    const f = stockFixture();
    adjustStock(f.db, f.anna, { id: f.screws.id, delta: -6, reason: "used" });
    markNotificationsRead(f.db, f.admin, {});
    adjustStock(f.db, f.anna, { id: f.screws.id, delta: 10, reason: "restocked" });
    expect(unreadCount(f.db, f.ben)).toBe(0);
    expect(listNotifications(f.db, f.admin).entries).toHaveLength(1);
  });

  test("a user-owned item notifies only its owner; editing the minimum counts too", () => {
    const f = stockFixture();
    const mine = f.item(f.anna, {
      name: "Batterien",
      typeId: f.other.id,
      attributes: { shop: "x" },
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      quantity: 3,
    });
    const v = f.db.select().from(items).where(eq(items.id, mine.id)).get()!.version;
    updateItem(f.db, f.admin, { id: mine.id, version: v, minQuantity: 4 });
    expect(unreadCount(f.db, f.anna)).toBe(1);
    expect(unreadCount(f.db, f.ben)).toBe(0);
    // Quantity edits in the form go to the ledger as "edited".
    const v2 = f.db.select().from(items).where(eq(items.id, mine.id)).get()!.version;
    updateItem(f.db, f.admin, { id: mine.id, version: v2, quantity: 6 });
    const moves = f.db.select().from(stockMoves).where(eq(stockMoves.itemId, mine.id)).all();
    expect(moves.map((x) => [x.delta, x.reason])).toEqual([[3, "edited"]]);
    expect(unreadCount(f.db, f.anna)).toBe(0);
  });

  test("the inbox hides the item once the reader cannot see it", () => {
    const f = stockFixture();
    const mine = f.item(f.anna, {
      name: "Geheim",
      typeId: f.other.id,
      attributes: { shop: "x" },
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      quantity: 3,
      minQuantity: 2,
    });
    f.db
      .insert(notifications)
      .values({ userId: f.ben.userId, kind: "stock.low", itemId: mine.id, payload: {} })
      .run();
    expect(listNotifications(f.db, f.ben).entries[0]?.item?.name).toBe("Geheim");
    f.db.update(items).set({ visibility: "private" }).where(eq(items.id, mine.id)).run();
    expect(listNotifications(f.db, f.ben).entries[0]?.item).toBeNull();
  });

  test("pages with a cursor and marks single notices read", () => {
    const f = stockFixture();
    for (let i = 0; i < 5; i++)
      f.db
        .insert(notifications)
        .values({
          userId: f.ben.userId,
          kind: "stock.low",
          itemId: f.screws.id,
          payload: { i },
          createdAt: new Date(1_800_000_000_000 + i),
        })
        .run();
    const p1 = listNotifications(f.db, f.ben, { limit: 3 });
    expect(p1.entries.map((e) => e.payload.i)).toEqual([4, 3, 2]);
    const p2 = listNotifications(f.db, f.ben, { limit: 3, cursor: p1.nextCursor! });
    expect(p2.entries.map((e) => e.payload.i)).toEqual([1, 0]);
    expect(p2.nextCursor).toBeNull();
    expect(markNotificationsRead(f.db, f.ben, { ids: [p1.entries[0]!.id] }).unread).toBe(4);
    // Someone else's ids are ignored.
    expect(markNotificationsRead(f.db, f.anna, { ids: [p1.entries[1]!.id] }).unread).toBe(0);
    expect(unreadCount(f.db, f.ben)).toBe(4);
  });
});
