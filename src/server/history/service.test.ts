import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { setAttachmentKind } from "../attachments/service";
import { canSeeMoney, type Level } from "../authz";
import { attachments, events, items } from "../db/schema";
import type { ItemsError } from "../items/errors";
import {
  changeItemOwner,
  moveItem,
  setItemGrant,
  setItemStatus,
  updateItem,
} from "../items/service";
import { setupFixture } from "../items/test-fixtures";
import { createLocation } from "../locations/service";
import { getItemHistory, redactEvent } from "./service";

const v = (f: ReturnType<typeof setupFixture>, id: string) =>
  f.db.select({ v: items.version }).from(items).where(eq(items.id, id)).get()!.v;

function scenario() {
  const f = setupFixture();
  const mine = { ownerKind: "user" as const, ownerId: f.anna.userId };
  const a = f.item(f.anna, { name: "Fernseher", owner: mine, priceCents: 50000 });
  const loc = createLocation(f.db, f.anna, { name: "Wohnzimmer" });
  updateItem(f.db, f.anna, { id: a.id, version: 1, priceCents: 45000 }); // money only
  updateItem(f.db, f.anna, { id: a.id, version: 2, name: "TV", priceCents: 40000 }); // mixed
  moveItem(f.db, f.anna, { id: a.id, version: 3, locationId: loc.id });
  setItemStatus(f.db, f.anna, { id: a.id, version: 4, status: "in_use" });
  setItemGrant(f.db, f.anna, {
    itemId: a.id,
    principalKind: "user",
    principalId: f.gast.userId,
    level: "view",
  });
  // What the attachments module writes.
  f.db
    .insert(events)
    .values([
      {
        itemId: a.id,
        actorId: f.anna.userId,
        action: "attachment.added",
        diff: { attachmentId: "r1", kind: "receipt", originalName: "rechnung.pdf" },
      },
      {
        itemId: a.id,
        actorId: f.anna.userId,
        action: "attachment.added",
        diff: { attachmentId: "p1", kind: "photo", originalName: "tv.jpg" },
      },
      {
        itemId: a.id,
        actorId: f.anna.userId,
        action: "attachment.removed",
        diff: { attachmentId: "r1", kind: "receipt", originalName: "rechnung.pdf" },
      },
    ])
    .run();
  changeItemOwner(f.db, f.anna, {
    id: a.id,
    version: v(f, a.id),
    owner: { ownerKind: "household" },
  });
  return { f, a, loc };
}

describe("history", () => {
  test("owner sees everything, newest first, with actor names", () => {
    const { f, a } = scenario();
    // After the owner change the item is household-owned: Anna has edit, admin manage.
    const page = getItemHistory(f.db, f.admin, { itemId: a.id });
    expect(page.entries.map((e) => e.action)).toEqual([
      "item.owner_changed",
      "attachment.removed",
      "attachment.added",
      "attachment.added",
      "item.grant_set",
      "item.status_changed",
      "item.moved",
      "item.updated",
      "item.updated",
      "item.created",
    ]);
    expect(page.entries[0]!.actor).toEqual({ id: f.anna.userId, name: "Anna" });
    expect(page.names.users[f.anna.userId]).toBe("Anna");
    expect(page.names.users[f.gast.userId]).toBe("Gast");
    expect(JSON.stringify(page)).toContain("45000");
  });

  test("below edit: no price or currency in any diff, no receipt events, no grant events", () => {
    const { f, a, loc } = scenario();
    const page = getItemHistory(f.db, f.gast, { itemId: a.id }); // gast: grant view
    const text = JSON.stringify(page);
    for (const s of ["50000", "45000", "40000", "EUR", "priceCents", "currency", "rechnung", "r1"])
      expect(text).not.toContain(s);
    expect(page.entries.map((e) => e.action)).toEqual([
      "item.owner_changed",
      "attachment.added",
      "item.status_changed",
      "item.moved",
      "item.updated", // the mixed one; the money-only update is gone
      "item.created",
    ]);
    expect(page.entries.find((e) => e.action === "item.updated")!.diff).toEqual({
      name: { from: "Fernseher", to: "TV" },
    });
    // Guests see location names only for locations they may see (the item is there).
    expect(page.names.locations[loc.id]).toBe("Wohnzimmer");
    // Ben (member, household item: edit) sees money but not grants.
    const ben = getItemHistory(f.db, f.ben, { itemId: a.id });
    expect(ben.entries.map((e) => e.action)).not.toContain("item.grant_set");
    expect(JSON.stringify(ben)).toContain("rechnung");
  });

  test("redactEvent rules by level", () => {
    const money = { action: "item.updated", diff: { priceCents: { from: 1, to: 2 } } };
    const grant = { action: "item.grant_set", diff: { principalId: "x" } };
    const receipt = { action: "attachment.added", diff: { kind: "receipt" } };
    for (const level of ["view", "use", "edit", "manage"] as Level[]) {
      expect(redactEvent(money, level) !== null).toBe(canSeeMoney(level));
      expect(redactEvent(receipt, level) !== null).toBe(canSeeMoney(level));
      expect(redactEvent(grant, level) !== null).toBe(level === "manage");
    }
    expect(
      redactEvent(
        {
          action: "item.created",
          diff: { name: { from: null, to: "x" }, priceCents: { from: null, to: 5 } },
        },
        "view",
      ),
    ).toEqual({
      name: { from: null, to: "x" },
    });
  });

  test("pagination and 404 for invisible items", () => {
    const { f, a } = scenario();
    const first = getItemHistory(f.db, f.admin, { itemId: a.id, limit: 4 });
    const second = getItemHistory(f.db, f.admin, {
      itemId: a.id,
      limit: 4,
      cursor: first.nextCursor!,
    });
    const third = getItemHistory(f.db, f.admin, {
      itemId: a.id,
      limit: 4,
      cursor: second.nextCursor!,
    });
    const all = [...first.entries, ...second.entries, ...third.entries].map((e) => e.id);
    expect(new Set(all).size).toBe(10);
    expect(third.nextCursor).toBeNull();
    const secret = f.item(f.anna, {
      name: "Geheim",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    let err: unknown;
    try {
      getItemHistory(f.db, f.ben, { itemId: secret.id });
    } catch (e) {
      err = e;
    }
    expect((err as ItemsError).code).toBe("ITEM_NOT_FOUND");
  });
});

describe("attachments reclassified as receipts", () => {
  test("every event of an attachment that is or was a receipt is hidden below edit", () => {
    const f = setupFixture();
    // Household-visible item of Anna's: Ben has view.
    const a = f.item(f.anna, {
      name: "Fernseher",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    const [bon, foto] = ["Kassenbon_TV_899EUR.jpg", "tv.pdf"].map((originalName) =>
      f.db
        .insert(attachments)
        .values({
          itemId: a.id,
          kind: "other",
          sha256: "0".repeat(64),
          mime: "application/pdf",
          bytes: 1,
          originalName,
          createdBy: f.anna.userId,
        })
        .returning()
        .get(),
    );
    for (const x of [bon!, foto!])
      f.db
        .insert(events)
        .values({
          itemId: a.id,
          actorId: f.anna.userId,
          action: "attachment.added",
          diff: { attachmentId: x.id, kind: "other", originalName: x.originalName },
        })
        .run();
    const before = JSON.stringify(getItemHistory(f.db, f.ben, { itemId: a.id }));
    expect(before).toContain("Kassenbon_TV_899EUR.jpg");

    setAttachmentKind(f.db, f.anna, { attachmentId: bon!.id, kind: "receipt" });
    const ev = f.db.select().from(events).where(eq(events.itemId, a.id)).all().at(-1)!;
    expect(ev.action).toBe("attachment.kind_changed");
    expect(ev.diff).toEqual({
      attachmentId: bon!.id,
      kind: { from: "other", to: "receipt" },
      originalName: "Kassenbon_TV_899EUR.jpg",
    });

    const viewer = getItemHistory(f.db, f.ben, { itemId: a.id });
    expect(JSON.stringify(viewer)).not.toContain("Kassenbon");
    expect(JSON.stringify(viewer)).not.toContain(bon!.id);
    expect(viewer.entries.filter((e) => e.action.startsWith("attachment.")).length).toBe(1);
    // Turning it back into "other" does not bring the old events back.
    setAttachmentKind(f.db, f.anna, { attachmentId: bon!.id, kind: "other" });
    expect(JSON.stringify(getItemHistory(f.db, f.ben, { itemId: a.id }))).not.toContain(
      "Kassenbon",
    );
    // Editors see the whole story.
    const owner = getItemHistory(f.db, f.anna, { itemId: a.id });
    expect(owner.entries.filter((e) => e.action === "attachment.kind_changed")).toHaveLength(2);
    expect(JSON.stringify(owner)).toContain("Kassenbon_TV_899EUR.jpg");
  });

  test("redactEvent hides kind changes to or from receipt by the event alone", () => {
    const e = {
      action: "attachment.kind_changed",
      diff: { attachmentId: "x", kind: { from: "receipt", to: "other" }, originalName: "bon.pdf" },
    };
    expect(redactEvent(e, "view")).toBeNull();
    expect(redactEvent(e, "edit")).not.toBeNull();
    const photo = { action: "attachment.added", diff: { attachmentId: "x", kind: "photo" } };
    expect(redactEvent(photo, "view", new Set(["x"]))).toBeNull();
    expect(redactEvent(photo, "view")).not.toBeNull();
  });
});
