import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { items, transfers } from "../db/schema";
import { getItemHistory } from "../history/service";
import { ItemsError } from "../items/errors";
import { changeItemOwner, getItem, setItemGrant } from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { listNotifications } from "../notifications/service";
import {
  acceptTransfer,
  cancelTransfer,
  declineTransfer,
  forceTransfer,
  getItemTransfer,
  getTransferOverview,
  startTransfer,
} from "./service";

function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof ItemsError ? e.code : (e as Error).message;
  }
}

function transferFixture() {
  const f = setupFixture();
  const jacket = f.item(f.anna, {
    name: "Winterjacke",
    owner: { ownerKind: "user", ownerId: f.anna.userId },
    visibility: "private",
  });
  const owner = (id: string) =>
    f.db
      .select({ k: items.ownerKind, id: items.ownerId, v: items.visibility })
      .from(items)
      .where(eq(items.id, id))
      .get();
  return { ...f, jacket, owner };
}

describe("transfers", () => {
  test("the owner offers a private item, the new owner sees the offer and accepts", () => {
    const f = transferFixture();
    const { transferId } = startTransfer(f.db, f.anna, {
      itemId: f.jacket.id,
      to: { ownerKind: "user", ownerId: f.ben.userId },
      note: "Passt mir nicht mehr",
    });
    // Ben cannot see the private item, but he sees the offer, by name.
    expect(code(() => getItem(f.db, f.ben, f.jacket.id))).toBe("ITEM_NOT_FOUND");
    const incoming = getTransferOverview(f.db, f.ben).incoming;
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({
      item: { name: "Winterjacke", visible: false },
      from: { kind: "user", name: "Anna" },
      note: "Passt mir nicht mehr",
      toMe: true,
      actions: { accept: true, decline: true, cancel: false },
    });
    expect(listNotifications(f.db, f.ben).entries[0]).toMatchObject({
      kind: "transfer.requested",
      item: null,
      payload: { actorName: "Anna", itemName: "Winterjacke" },
    });
    expect(getTransferOverview(f.db, f.anna).outgoing[0]?.to.name).toBe("Ben");
    expect(getItemTransfer(f.db, f.anna, f.jacket.id)?.actions).toMatchObject({ cancel: true });

    acceptTransfer(f.db, f.ben, { transferId });
    expect(f.owner(f.jacket.id)).toEqual({ k: "user", id: f.ben.userId, v: "private" });
    expect(getItem(f.db, f.ben, f.jacket.id).permissions.canManage).toBe(true);
    expect(code(() => getItem(f.db, f.anna, f.jacket.id))).toBe("ITEM_NOT_FOUND");
    expect(listNotifications(f.db, f.anna).entries[0]?.kind).toBe("transfer.accepted");
    const changed = getItemHistory(f.db, f.ben, { itemId: f.jacket.id }).entries.find(
      (e) => e.action === "item.owner_changed",
    );
    expect(changed?.diff).toMatchObject({ reason: "transfer", ownerId: { to: f.ben.userId } });
    expect(code(() => acceptTransfer(f.db, f.ben, { transferId }))).toBe("TRANSFER_STATE");
  });

  test("only the new owner answers; strangers do not even see it", () => {
    const f = transferFixture();
    const t = startTransfer(f.db, f.anna, {
      itemId: f.jacket.id,
      to: { ownerKind: "group", ownerId: f.group.id },
    });
    expect(code(() => acceptTransfer(f.db, f.gast, t))).toBe("TRANSFER_NOT_FOUND");
    expect(code(() => acceptTransfer(f.db, f.anna, t))).toBe("ITEM_FORBIDDEN");
    // Ben is in the group: he may decline for it.
    declineTransfer(f.db, f.ben, t);
    expect(f.owner(f.jacket.id)?.id).toBe(f.anna.userId);
    expect(listNotifications(f.db, f.anna).entries[0]?.kind).toBe("transfer.declined");
  });

  test("start rules: manage, valid target, not the owner, one at a time, not to oneself", () => {
    const f = transferFixture();
    const tent = f.item(f.ben, {
      name: "Zelt",
      owner: { ownerKind: "group", ownerId: f.group.id },
    });
    const to = (ownerKind: "user" | "group", ownerId: string) => ({ ownerKind, ownerId });
    expect(
      code(() => startTransfer(f.db, f.ben, { itemId: f.jacket.id, to: to("user", f.ben.userId) })),
    ).toBe("ITEM_NOT_FOUND");
    expect(
      code(() =>
        startTransfer(f.db, f.anna, { itemId: f.jacket.id, to: to("user", f.gast.userId) }),
      ),
    ).toBe("OWNER_INVALID");
    expect(
      code(() =>
        startTransfer(f.db, f.anna, { itemId: f.jacket.id, to: to("user", f.anna.userId) }),
      ),
    ).toBe("TRANSFER_SAME_OWNER");
    // A co-member of the owning group must not take the group's item.
    expect(
      code(() => startTransfer(f.db, f.ben, { itemId: tent.id, to: to("user", f.ben.userId) })),
    ).toBe("TRANSFER_TO_SELF");
    // A manage grantee neither.
    setItemGrant(f.db, f.anna, {
      itemId: f.jacket.id,
      principalKind: "user",
      principalId: f.ben.userId,
      level: "manage",
    });
    expect(
      code(() => startTransfer(f.db, f.ben, { itemId: f.jacket.id, to: to("user", f.ben.userId) })),
    ).toBe("TRANSFER_TO_SELF");
    // But he may offer it to someone else; Anna (the owner) hears about it.
    startTransfer(f.db, f.ben, { itemId: f.jacket.id, to: to("user", f.admin.userId) });
    expect(listNotifications(f.db, f.anna).entries[0]).toMatchObject({
      kind: "transfer.started",
      payload: { actorName: "Ben", toName: "Admin" },
    });
    expect(
      code(() => startTransfer(f.db, f.anna, { itemId: f.jacket.id, to: to("group", f.group.id) })),
    ).toBe("TRANSFER_PENDING");
  });

  test("cancel by the starter or a manager; offers go stale when the owner changes", () => {
    const f = transferFixture();
    const a = startTransfer(f.db, f.anna, {
      itemId: f.jacket.id,
      to: { ownerKind: "user", ownerId: f.ben.userId },
    });
    expect(code(() => cancelTransfer(f.db, f.ben, a))).toBe("ITEM_FORBIDDEN");
    cancelTransfer(f.db, f.anna, a);
    expect(listNotifications(f.db, f.ben).entries[0]?.kind).toBe("transfer.cancelled");

    const b = startTransfer(f.db, f.anna, {
      itemId: f.jacket.id,
      to: { ownerKind: "user", ownerId: f.ben.userId },
    });
    changeItemOwner(f.db, f.admin, {
      id: f.jacket.id,
      version: f.db.select().from(items).where(eq(items.id, f.jacket.id)).get()!.version,
      owner: { ownerKind: "group", ownerId: f.group.id },
    });
    expect(code(() => acceptTransfer(f.db, f.ben, b))).toBe("TRANSFER_STALE");
    expect(f.db.select().from(transfers).where(eq(transfers.id, b.transferId)).get()?.status).toBe(
      "cancelled",
    );
    expect(f.owner(f.jacket.id)?.k).toBe("group");
  });

  test("admins force a pending transfer; the history hides offers below manage", () => {
    const f = transferFixture();
    const saw = f.item(f.anna, {
      name: "Säge",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    const t = startTransfer(f.db, f.anna, {
      itemId: saw.id,
      to: { ownerKind: "user", ownerId: f.ben.userId },
    });
    expect(code(() => forceTransfer(f.db, f.anna, t))).toBe("ITEM_FORBIDDEN");
    forceTransfer(f.db, f.admin, t);
    expect(f.owner(saw.id)?.id).toBe(f.ben.userId);
    expect(f.db.select().from(transfers).where(eq(transfers.id, t.transferId)).get()?.status).toBe(
      "forced",
    );
    // Anna can still view it (household visibility): she sees the change, not the offer.
    const actions = getItemHistory(f.db, f.anna, { itemId: saw.id }).entries.map((e) => e.action);
    expect(actions).toContain("item.owner_changed");
    expect(actions).not.toContain("item.transfer_started");
    expect(listNotifications(f.db, f.ben).entries[0]?.kind).toBe("transfer.accepted");
  });
});
