import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { parseItemsError } from "../../lib/items/errors";
import type { AuthCtx } from "../authz/ctx";
import { seed } from "../authz/test-fixtures";
import { attachments, events, groups, items, jobs, users } from "../db/schema";
import { getItemHistory } from "../history/service";
import { archiveItemType, createItemType } from "../item-types/service";
import { createLocation } from "../locations/service";
import { searchItems } from "../search/query";
import { attachTag } from "../tags/service";
import { ItemsError } from "./errors";
import {
  changeItemOwner,
  changeItemType,
  deleteItem,
  getItem,
  listItemGrants,
  moveItem,
  reassignUserItems,
  removeItemGrant,
  resolveShortCode,
  setItemGrant,
  setItemStatus,
  setItemVisibility,
  updateItem,
} from "./service";
import { type Fixture, setupFixture } from "./test-fixtures";

/** "OK" or the error code thrown by fn. */
function code(fn: () => unknown): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    if (e instanceof ItemsError) return e.code;
    return (e as Error).message;
  }
}

const version = (f: Fixture, id: string) =>
  f.db.select({ v: items.version }).from(items).where(eq(items.id, id)).get()?.v ?? 1;

// --- Permission matrix ---------------------------------------------------------------

type Key = "H" | "A" | "AP" | "G" | "APg";
type Who = "admin" | "anna" | "ben" | "gast";
const LEVEL: Record<Who, Record<Key, string>> = {
  admin: { H: "manage", A: "manage", AP: "manage", G: "manage", APg: "manage" },
  anna: { H: "edit", A: "manage", AP: "manage", G: "none", APg: "manage" },
  ben: { H: "edit", A: "view", AP: "none", G: "manage", APg: "edit" },
  gast: { H: "none", A: "none", AP: "none", G: "none", APg: "use" },
};
const RANK: Record<string, number> = { none: 0, view: 1, use: 2, edit: 3, manage: 4 };

function scenario() {
  const f = setupFixture();
  const { admin, anna, group } = f;
  const H = f.item(admin, { name: "Bohrmaschine" });
  const A = f.item(admin, {
    name: "Annas Fahrrad",
    owner: { ownerKind: "user", ownerId: anna.userId },
  });
  const AP = f.item(admin, {
    name: "Annas Tagebuch",
    owner: { ownerKind: "user", ownerId: anna.userId },
    visibility: "private",
  });
  const G = f.item(admin, {
    name: "Kinderzelt",
    owner: { ownerKind: "group", ownerId: group.id },
    visibility: "private",
  });
  const APg = f.item(admin, {
    name: "Annas Kamera",
    owner: { ownerKind: "user", ownerId: anna.userId },
    visibility: "private",
  });
  setItemGrant(f.db, admin, {
    itemId: APg.id,
    principalKind: "user",
    principalId: f.gast.userId,
    level: "use",
  });
  setItemGrant(f.db, admin, {
    itemId: APg.id,
    principalKind: "user",
    principalId: f.ben.userId,
    level: "edit",
  });
  const loc = createLocation(f.db, admin, { name: "Garage" });
  // Something shared with the guest lives in the garage, so the guest knows the place.
  const guestBook = f.item(admin, {
    name: "Gästebuch",
    locationId: loc.id,
    visibility: "private",
    owner: { ownerKind: "user", ownerId: admin.userId },
  });
  setItemGrant(f.db, admin, {
    itemId: guestBook.id,
    principalKind: "user",
    principalId: f.gast.userId,
    level: "view",
  });
  return { f, ids: { H: H.id, A: A.id, AP: AP.id, G: G.id, APg: APg.id }, loc };
}

type Op = {
  name: string;
  min: string;
  /** "who/key" pairs refused (ITEM_FORBIDDEN) although the level reaches `min`. */
  deny?: string[];
  run: (s: ReturnType<typeof scenario>, ctx: AuthCtx, id: string) => unknown;
};
const OPS: Op[] = [
  { name: "getItem", min: "view", run: (s, c, id) => getItem(s.f.db, c, id) },
  {
    name: "history",
    min: "view",
    run: (s, c, id) => getItemHistory(s.f.db, c, { itemId: id }),
  },
  {
    name: "moveItem",
    min: "use",
    run: (s, c, id) => moveItem(s.f.db, c, { id, version: version(s.f, id), locationId: s.loc.id }),
  },
  {
    name: "status needs_repair",
    min: "use",
    run: (s, c, id) =>
      setItemStatus(s.f.db, c, { id, version: version(s.f, id), status: "needs_repair" }),
  },
  {
    name: "updateItem",
    min: "edit",
    run: (s, c, id) => updateItem(s.f.db, c, { id, version: version(s.f, id), name: "Neu" }),
  },
  {
    name: "changeItemType preview",
    min: "edit",
    run: (s, c, id) =>
      changeItemType(s.f.db, c, { id, version: version(s.f, id), typeId: s.f.power.id }),
  },
  {
    name: "attachTag",
    min: "edit",
    run: (s, c, id) => attachTag(s.f.db, c, { itemId: id, version: version(s.f, id), name: "x" }),
  },
  {
    name: "status sold (gone)",
    min: "manage",
    run: (s, c, id) => setItemStatus(s.f.db, c, { id, version: version(s.f, id), status: "sold" }),
  },
  {
    name: "changeItemOwner",
    min: "manage",
    // Ben manages the group's tent as a member, but only admins re-own group items.
    deny: ["ben/G"],
    run: (s, c, id) =>
      changeItemOwner(s.f.db, c, {
        id,
        version: version(s.f, id),
        owner: { ownerKind: "household" },
      }),
  },
  {
    name: "setItemVisibility",
    min: "manage",
    run: (s, c, id) => {
      const it = s.f.db.select().from(items).where(eq(items.id, id)).get();
      if (!it) return setItemVisibility(s.f.db, c, { id, version: 1, visibility: "private" });
      const to =
        it.ownerKind === "household"
          ? "household"
          : it.visibility === "private"
            ? "household"
            : "private";
      return setItemVisibility(s.f.db, c, { id, version: it.version, visibility: to });
    },
  },
  { name: "listItemGrants", min: "manage", run: (s, c, id) => listItemGrants(s.f.db, c, id) },
  {
    name: "setItemGrant",
    min: "manage",
    run: (s, c, id) =>
      setItemGrant(s.f.db, c, {
        itemId: id,
        principalKind: "group",
        principalId: s.f.group.id,
        level: "view",
      }),
  },
  {
    name: "deleteItem",
    min: "manage",
    run: (s, c, id) => deleteItem(s.f.db, c, { id, version: version(s.f, id) }),
  },
];

describe("permission matrix (role x ownership x visibility x grant x operation)", () => {
  for (const op of OPS)
    test(op.name, () => {
      // A fresh scenario per caller: the five items are independent of each other.
      for (const who of ["gast", "ben", "anna", "admin"] as Who[]) {
        const s = scenario();
        const ctx = { admin: s.f.admin, anna: s.f.anna, ben: s.f.ben, gast: s.f.gast }[who];
        for (const key of ["H", "A", "AP", "G", "APg"] as Key[]) {
          const lvl = LEVEL[who][key]!;
          const got = code(() => op.run(s, ctx, s.ids[key]));
          const want =
            lvl === "none"
              ? "ITEM_NOT_FOUND"
              : RANK[lvl]! >= RANK[op.min]! && !op.deny?.includes(`${who}/${key}`)
                ? "OK"
                : "ITEM_FORBIDDEN";
          expect(`${who}/${key}: ${got}`).toBe(`${who}/${key}: ${want}`);
        }
      }
    });
});

describe("create", () => {
  test("guests cannot create; members only for themselves, the household or their groups", () => {
    const f = setupFixture();
    expect(code(() => f.item(f.gast, { name: "x" }))).toBe("ITEM_FORBIDDEN");
    expect(code(() => f.item(f.anna, { name: "x" }))).toBe("OK");
    expect(
      code(() =>
        f.item(f.anna, { name: "x", owner: { ownerKind: "user", ownerId: f.anna.userId } }),
      ),
    ).toBe("OK");
    expect(
      code(() =>
        f.item(f.anna, { name: "x", owner: { ownerKind: "user", ownerId: f.ben.userId } }),
      ),
    ).toBe("OWNER_NOT_ALLOWED");
    expect(
      code(() => f.item(f.anna, { name: "x", owner: { ownerKind: "group", ownerId: f.group.id } })),
    ).toBe("OWNER_NOT_ALLOWED");
    expect(
      code(() => f.item(f.ben, { name: "x", owner: { ownerKind: "group", ownerId: f.group.id } })),
    ).toBe("OK");
    expect(
      code(() =>
        f.item(f.admin, { name: "x", owner: { ownerKind: "user", ownerId: f.ben.userId } }),
      ),
    ).toBe("OK");
    expect(
      code(() =>
        f.item(f.admin, { name: "x", owner: { ownerKind: "user", ownerId: f.gast.userId } }),
      ),
    ).toBe("OWNER_INVALID");
    expect(
      code(() => f.item(f.admin, { name: "x", owner: { ownerKind: "user", ownerId: "nope" } })),
    ).toBe("OWNER_INVALID");
  });

  test("gets a unique short code, a version and an item.created event", () => {
    const f = setupFixture();
    const codes = new Set<string>();
    for (let i = 0; i < 30; i++) codes.add(f.item(f.anna, { name: `Ding ${i}` }).shortCode);
    expect(codes.size).toBe(30);
    const a = f.item(f.anna, { name: "Säge", priceCents: 1999 });
    expect(a.version).toBe(1);
    expect(a.shortCode).toMatch(/^[A-Z2-9]{6}$/);
    const row = f.db.select().from(items).where(eq(items.id, a.id)).get()!;
    expect(row.currency).toBe("EUR"); // household currency filled in
    expect(row.createdBy).toBe(f.anna.userId);
    const ev = f.db.select().from(events).where(eq(events.itemId, a.id)).all();
    expect(ev.map((e) => e.action)).toEqual(["item.created"]);
    expect((ev[0]!.diff as Record<string, unknown>).name).toEqual({ from: null, to: "Säge" });
    expect(resolveShortCode(f.db, f.anna, a.shortCode.toLowerCase())).toEqual({
      kind: "item",
      id: a.id,
    });
  });

  test("household-owned items cannot be private (rejected on create and on visibility change)", () => {
    const f = setupFixture();
    expect(code(() => f.item(f.anna, { name: "x", visibility: "private" }))).toBe(
      "HOUSEHOLD_PRIVATE",
    );
    const h = f.item(f.anna, { name: "x" });
    expect(
      code(() => setItemVisibility(f.db, f.admin, { id: h.id, version: 1, visibility: "private" })),
    ).toBe("HOUSEHOLD_PRIVATE");
  });

  test("archived and unknown types are refused", () => {
    const f = setupFixture();
    archiveItemType(f.db, f.admin, { id: f.other.id, archived: true });
    expect(code(() => f.item(f.anna, { name: "x", typeId: f.other.id }))).toBe("TYPE_ARCHIVED");
    expect(code(() => f.item(f.anna, { name: "x", typeId: "nope" }))).toBe("TYPE_NOT_FOUND");
  });
});

describe("attributes", () => {
  test("validated against the type's effective fields, with German field errors", () => {
    const f = setupFixture();
    let err: unknown;
    try {
      f.item(f.anna, { name: "x", attributes: { voltage: "viel", season: "Herbst" } });
    } catch (e) {
      err = e;
    }
    const parsed = parseItemsError(err);
    expect(parsed.code).toBe("ATTRIBUTES_INVALID");
    expect(Object.keys(parsed.fieldErrors).sort()).toEqual(["season", "voltage"]);
    // Subtype inherits the parent's fields.
    const ok = f.item(f.anna, {
      name: "Akkuschrauber",
      typeId: f.power.id,
      attributes: { voltage: 18, battery: "Bosch 18V", brand: " Bosch " },
    });
    const row = f.db.select().from(items).where(eq(items.id, ok.id)).get()!;
    expect(row.attributes).toEqual({ voltage: 18, battery: "Bosch 18V", brand: "Bosch" });
    // Required field of another type.
    expect(code(() => f.item(f.anna, { name: "x", typeId: f.other.id }))).toBe(
      "ATTRIBUTES_INVALID",
    );
  });

  test("user references must exist, item references must be visible to the caller", () => {
    const f = setupFixture();
    expect(code(() => f.item(f.anna, { name: "x", attributes: { keeper: "ghost" } }))).toBe(
      "ATTRIBUTES_INVALID",
    );
    expect(code(() => f.item(f.anna, { name: "x", attributes: { keeper: f.ben.userId } }))).toBe(
      "OK",
    );
    const secret = f.item(f.ben, {
      name: "Geheim",
      owner: { ownerKind: "user", ownerId: f.ben.userId },
      visibility: "private",
    });
    const shared = f.item(f.ben, { name: "Offen" });
    expect(code(() => f.item(f.anna, { name: "x", attributes: { fits: [secret.id] } }))).toBe(
      "ATTRIBUTES_INVALID",
    );
    expect(code(() => f.item(f.anna, { name: "x", attributes: { fits: ["missing"] } }))).toBe(
      "ATTRIBUTES_INVALID",
    );
    expect(code(() => f.item(f.anna, { name: "x", attributes: { fits: [shared.id] } }))).toBe("OK");
    // Ben sets a reference to his private item on a household item; Anna can
    // still edit that item as long as she keeps the reference unchanged.
    const h = f.item(f.ben, { name: "Staubsauger", attributes: { fits: [secret.id] } });
    expect(
      code(() =>
        updateItem(f.db, f.anna, {
          id: h.id,
          version: 1,
          attributes: { fits: [secret.id], brand: "Miele" },
        }),
      ),
    ).toBe("OK");
    // Anna's view of the item does not resolve the private item's name.
    const d = getItem(f.db, f.anna, h.id);
    expect(d.references.items[secret.id]).toBeUndefined();
    expect(getItem(f.db, f.ben, h.id).references.items[secret.id]).toBe("Geheim");
  });
});

describe("optimistic locking", () => {
  test("a stale version is VERSION_CONFLICT (409) and changes nothing", () => {
    const f = setupFixture();
    const a = f.item(f.anna, { name: "Leiter" });
    const loc = createLocation(f.db, f.anna, { name: "Keller" });
    expect(updateItem(f.db, f.anna, { id: a.id, version: 1, name: "Leiter 2" })).toEqual({
      version: 2,
    });
    let err: unknown;
    try {
      updateItem(f.db, f.ben, { id: a.id, version: 1, name: "Überschrieben" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ItemsError);
    expect((err as ItemsError).status).toBe(409);
    expect(parseItemsError(err).code).toBe("VERSION_CONFLICT");
    for (const fn of [
      () => moveItem(f.db, f.anna, { id: a.id, version: 1, locationId: loc.id }),
      () => setItemStatus(f.db, f.anna, { id: a.id, version: 1, status: "in_use" }),
      () => changeItemType(f.db, f.anna, { id: a.id, version: 1, typeId: f.power.id }),
      () => attachTag(f.db, f.anna, { itemId: a.id, version: 1, name: "x" }),
      () => deleteItem(f.db, f.admin, { id: a.id, version: 1 }),
    ])
      expect(code(fn)).toBe("VERSION_CONFLICT");
    const row = f.db.select().from(items).where(eq(items.id, a.id)).get()!;
    expect(row.name).toBe("Leiter 2");
    expect(row.version).toBe(2);
  });

  test("a no-op update keeps the version and writes no event", () => {
    const f = setupFixture();
    const a = f.item(f.anna, { name: "Leiter" });
    expect(updateItem(f.db, f.anna, { id: a.id, version: 1, name: "Leiter" })).toEqual({
      version: 1,
    });
    expect(f.db.select().from(events).where(eq(events.itemId, a.id)).all()).toHaveLength(1);
  });
});

describe("update", () => {
  test("writes a field diff including attributes and tags", () => {
    const f = setupFixture();
    const a = f.item(f.anna, { name: "Leiter", attributes: { brand: "Hailo" }, tags: ["Garten"] });
    updateItem(f.db, f.anna, {
      id: a.id,
      version: 1,
      name: "Stehleiter",
      priceCents: 4900,
      attributes: { brand: "Hailo", voltage: 0 },
      tags: ["Garten", "Haus"],
    });
    const ev = f.db.select().from(events).where(eq(events.itemId, a.id)).all().at(-1)!;
    expect(ev.action).toBe("item.updated");
    expect(ev.diff).toEqual({
      name: { from: "Leiter", to: "Stehleiter" },
      priceCents: { from: null, to: 4900 },
      currency: { from: null, to: "EUR" },
      "attributes.voltage": { from: null, to: 0 },
      tags: { from: ["Garten"], to: ["Garten", "Haus"] },
    });
  });
});

describe("move and status at use", () => {
  test("a guest with a use grant can move and change status, not edit", () => {
    const f = setupFixture();
    const a = f.item(f.anna, {
      name: "Kamera",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
    });
    setItemGrant(f.db, f.anna, {
      itemId: a.id,
      principalKind: "user",
      principalId: f.gast.userId,
      level: "use",
    });
    const loc = createLocation(f.db, f.anna, { name: "Wohnzimmer" });
    // Guests only know locations where something shared with them is.
    expect(code(() => moveItem(f.db, f.gast, { id: a.id, version: 1, locationId: loc.id }))).toBe(
      "LOCATION_NOT_FOUND",
    );
    const b = f.item(f.anna, {
      name: "Stativ",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      locationId: loc.id,
    });
    setItemGrant(f.db, f.anna, {
      itemId: b.id,
      principalKind: "user",
      principalId: f.gast.userId,
      level: "view",
    });
    expect(moveItem(f.db, f.gast, { id: a.id, version: 1, locationId: loc.id })).toEqual({
      version: 2,
    });
    expect(setItemStatus(f.db, f.gast, { id: a.id, version: 2, status: "in_use" })).toEqual({
      version: 3,
    });
    expect(code(() => updateItem(f.db, f.gast, { id: a.id, version: 3, name: "x" }))).toBe(
      "ITEM_FORBIDDEN",
    );
    expect(
      code(() => setItemStatus(f.db, f.gast, { id: a.id, version: 3, status: "disposed" })),
    ).toBe("ITEM_FORBIDDEN");
    const ev = f.db.select().from(events).where(eq(events.itemId, a.id)).all();
    expect(ev.map((e) => e.action)).toContain("item.moved");
    expect(ev.map((e) => e.action)).toContain("item.status_changed");
  });

  test("leaving a gone status also needs manage", () => {
    const f = setupFixture();
    const h = f.item(f.anna, { name: "Alt", status: "archived" });
    expect(
      code(() => setItemStatus(f.db, f.ben, { id: h.id, version: 1, status: "available" })),
    ).toBe("ITEM_FORBIDDEN");
    expect(
      code(() => setItemStatus(f.db, f.admin, { id: h.id, version: 1, status: "available" })),
    ).toBe("OK");
  });
});

describe("references to items the caller cannot see", () => {
  function setup() {
    const f = setupFixture();
    const type = createItemType(f.db, f.admin, {
      key: "kit",
      name: "Set",
      icon: null,
      tracking: "individual",
      parentId: null,
      fields: [
        { key: "parts", label: "Teile", kind: "item", multiple: true },
        { key: "partner", label: "Gegenstück", kind: "item" },
        { key: "note", label: "Notiz", kind: "text" },
      ],
    });
    const secret = f.item(f.anna, {
      name: "Annas Geheimnis",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const open = f.item(f.anna, { name: "Leiter" });
    // Household item: Ben may edit it but cannot see Anna's private item.
    const kit = f.item(f.anna, {
      name: "Werkzeugset",
      typeId: type.id,
      attributes: { parts: [open.id, secret.id], partner: secret.id, note: "alt" },
    });
    const stored = () => f.db.select().from(items).where(eq(items.id, kit.id)).get()!.attributes;
    return { f, type, secret, open, kit, stored };
  }

  test("the detail response leaves hidden ids out and counts them", () => {
    const { f, secret, open, kit } = setup();
    const d = getItem(f.db, f.ben, kit.id);
    expect(d.item.attributes).toEqual({ parts: [open.id], note: "alt" });
    expect(d.hiddenReferences).toEqual({ parts: 1, partner: 1 });
    expect(JSON.stringify(d)).not.toContain(secret.id);
    // The owner of the secret (and admins) see everything.
    expect(getItem(f.db, f.anna, kit.id).item.attributes.partner).toBe(secret.id);
    expect(getItem(f.db, f.admin, kit.id).hiddenReferences).toEqual({});
  });

  test("saving what the editor saw keeps the hidden references", () => {
    const { f, secret, open, kit, stored } = setup();
    const seen = getItem(f.db, f.ben, kit.id).item.attributes;
    updateItem(f.db, f.ben, { id: kit.id, version: 1, attributes: { ...seen, note: "neu" } });
    expect(stored()).toEqual({ parts: [open.id, secret.id], partner: secret.id, note: "neu" });
    // Emptying the visible part of a list or leaving the single field empty keeps them too.
    updateItem(f.db, f.ben, { id: kit.id, version: 2, attributes: { parts: [] } });
    expect(stored()).toEqual({ parts: [secret.id], partner: secret.id });
    // The history shows no change to the hidden values.
    const ev = f.db.select().from(events).where(eq(events.itemId, kit.id)).all().at(-1)!;
    expect(Object.keys(ev.diff as object).sort()).toEqual(["attributes.note", "attributes.parts"]);
    // Picking another item for the single field is a deliberate replacement.
    updateItem(f.db, f.ben, { id: kit.id, version: 3, attributes: { partner: open.id } });
    expect(stored()).toEqual({ parts: [secret.id], partner: open.id });
  });

  test("history diffs show a hidden reference without its id", () => {
    const { f, secret, open, kit } = setup();
    updateItem(f.db, f.anna, { id: kit.id, version: 1, attributes: { partner: open.id } });
    const h = getItemHistory(f.db, f.ben, { itemId: kit.id });
    expect(JSON.stringify(h)).not.toContain(secret.id);
    const change = h.entries.find((e) => e.action === "item.updated")!.diff[
      "attributes.partner"
    ] as { from: string; to: string };
    expect(change).toEqual({ from: "hidden", to: open.id });
    expect(h.names.items[open.id]).toBe("Leiter");
    // Anna sees the real ids.
    expect(JSON.stringify(getItemHistory(f.db, f.anna, { itemId: kit.id }))).toContain(secret.id);
  });

  test("the type change preview leaves hidden ids out", () => {
    const { f, secret, kit } = setup();
    const p = changeItemType(f.db, f.ben, { id: kit.id, version: 1, typeId: f.tool.id });
    expect(p.status).toBe("preview");
    expect(JSON.stringify(p)).not.toContain(secret.id);
  });
});

describe("type change", () => {
  test("preview first, apply only with confirm; required fields of the new type are asked for", () => {
    const f = setupFixture();
    const a = f.item(f.anna, { name: "Kabel", attributes: { brand: "X", voltage: 230 } });
    const p = changeItemType(f.db, f.anna, { id: a.id, version: 1, typeId: f.other.id });
    expect(p.status).toBe("preview");
    if (p.status !== "preview") throw new Error();
    expect(p.plan.legacy.sort()).toEqual(["brand", "voltage"]);
    expect(p.plan.missingRequired).toEqual(["shop"]);
    expect(version(f, a.id)).toBe(1);
    expect(
      code(() =>
        changeItemType(f.db, f.anna, { id: a.id, version: 1, typeId: f.other.id, confirm: true }),
      ),
    ).toBe("ATTRIBUTES_INVALID");
    const r = changeItemType(f.db, f.anna, {
      id: a.id,
      version: 1,
      typeId: f.other.id,
      confirm: true,
      attributes: { shop: "Baumarkt" },
    });
    expect(r).toEqual({ status: "saved", version: 2 });
    const row = f.db.select().from(items).where(eq(items.id, a.id)).get()!;
    expect(row.typeId).toBe(f.other.id);
    // Legacy values survive ("Alte Felder").
    expect(row.attributes).toEqual({ shop: "Baumarkt", brand: "X", voltage: 230 });
    const ev = f.db.select().from(events).where(eq(events.itemId, a.id)).all().at(-1)!;
    expect(ev.action).toBe("item.type_changed");
  });
});

describe("owner changes", () => {
  /** Ben gets `manage` on Anna's private item through a grant. */
  function annasPrivateItemManagedByBen() {
    const f = setupFixture();
    const a = f.item(f.anna, {
      name: "Annas Uhr",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    setItemGrant(f.db, f.anna, {
      itemId: a.id,
      principalKind: "user",
      principalId: f.ben.userId,
      level: "manage",
    });
    return { f, a };
  }

  test("a manage grantee cannot take the item (or give it away) and lock the owner out", () => {
    const { f, a } = annasPrivateItemManagedByBen();
    expect(getItem(f.db, f.ben, a.id).permissions.canManage).toBe(true);
    expect(getItem(f.db, f.ben, a.id).permissions.canChangeOwner).toBe(false);
    for (const owner of [
      { ownerKind: "user" as const, ownerId: f.ben.userId },
      { ownerKind: "household" as const },
      { ownerKind: "group" as const, ownerId: f.group.id },
    ])
      expect(code(() => changeItemOwner(f.db, f.ben, { id: a.id, version: 1, owner }))).toBe(
        "ITEM_FORBIDDEN",
      );
    const row = f.db.select().from(items).where(eq(items.id, a.id)).get()!;
    expect([row.ownerKind, row.ownerId]).toEqual(["user", f.anna.userId]);
    expect(getItem(f.db, f.anna, a.id).item.name).toBe("Annas Uhr");
  });

  test("a co-member of the owning group cannot re-own a group item; an admin can", () => {
    const f = setupFixture();
    const g = f.item(f.ben, {
      name: "Zelt",
      owner: { ownerKind: "group", ownerId: f.group.id },
      visibility: "private",
    });
    expect(getItem(f.db, f.ben, g.id).permissions).toMatchObject({
      canManage: true,
      canChangeOwner: false,
    });
    for (const owner of [
      { ownerKind: "user" as const, ownerId: f.ben.userId },
      { ownerKind: "household" as const },
    ])
      expect(code(() => changeItemOwner(f.db, f.ben, { id: g.id, version: 1, owner }))).toBe(
        "ITEM_FORBIDDEN",
      );
    expect(getItem(f.db, f.admin, g.id).permissions.canChangeOwner).toBe(true);
    expect(
      changeItemOwner(f.db, f.admin, {
        id: g.id,
        version: 1,
        owner: { ownerKind: "user", ownerId: f.anna.userId },
      }),
    ).toEqual({ version: 2, visibility: "private" });
  });

  test("the direct owner gives the item to the household or an own group, not to others", () => {
    const f = setupFixture();
    const b = f.item(f.ben, {
      name: "Rad",
      owner: { ownerKind: "user", ownerId: f.ben.userId },
      visibility: "private",
    });
    expect(getItem(f.db, f.ben, b.id).permissions.canChangeOwner).toBe(true);
    expect(
      code(() =>
        changeItemOwner(f.db, f.ben, {
          id: b.id,
          version: 1,
          owner: { ownerKind: "user", ownerId: f.anna.userId },
        }),
      ),
    ).toBe("OWNER_NOT_ALLOWED");
    // A group Ben is not in.
    const other = f.db.insert(groups).values({ name: "Eltern" }).returning().get();
    expect(
      code(() =>
        changeItemOwner(f.db, f.ben, {
          id: b.id,
          version: 1,
          owner: { ownerKind: "group", ownerId: other.id },
        }),
      ),
    ).toBe("OWNER_NOT_ALLOWED");
    expect(
      changeItemOwner(f.db, f.ben, {
        id: b.id,
        version: 1,
        owner: { ownerKind: "group", ownerId: f.group.id },
      }),
    ).toEqual({ version: 2, visibility: "private" });
    // Now group-owned: even the former owner needs an admin to change it again.
    expect(
      code(() =>
        changeItemOwner(f.db, f.ben, { id: b.id, version: 2, owner: { ownerKind: "household" } }),
      ),
    ).toBe("ITEM_FORBIDDEN");

    const c = f.item(f.ben, {
      name: "Helm",
      owner: { ownerKind: "user", ownerId: f.ben.userId },
      visibility: "private",
    });
    // To the household: becomes household-visible.
    expect(
      changeItemOwner(f.db, f.ben, { id: c.id, version: 1, owner: { ownerKind: "household" } }),
    ).toEqual({ version: 2, visibility: "household" });
    // Household-owned: members have edit only; only an admin may re-own it.
    expect(getItem(f.db, f.ben, c.id).permissions.canChangeOwner).toBe(false);
    expect(
      code(() =>
        changeItemOwner(f.db, f.ben, {
          id: c.id,
          version: 2,
          owner: { ownerKind: "user", ownerId: f.ben.userId },
        }),
      ),
    ).toBe("ITEM_FORBIDDEN");
    const ev = f.db
      .select()
      .from(events)
      .where(eq(events.itemId, c.id))
      .all()
      .filter((e) => e.action === "item.owner_changed");
    expect(ev).toHaveLength(1);
    expect((ev[0]!.diff as Record<string, unknown>).visibility).toEqual({
      from: "private",
      to: "household",
    });
  });

  test("an admin may change the owner in every case", () => {
    const { f, a } = annasPrivateItemManagedByBen();
    const g = f.item(f.ben, { name: "Zelt", owner: { ownerKind: "group", ownerId: f.group.id } });
    const h = f.item(f.anna, { name: "Leiter" });
    let v = 1;
    for (const owner of [
      { ownerKind: "user" as const, ownerId: f.ben.userId },
      { ownerKind: "group" as const, ownerId: f.group.id },
      { ownerKind: "household" as const },
    ])
      v = changeItemOwner(f.db, f.admin, { id: a.id, version: v, owner }).version;
    expect(v).toBe(4);
    expect(
      changeItemOwner(f.db, f.admin, { id: g.id, version: 1, owner: { ownerKind: "household" } })
        .version,
    ).toBe(2);
    expect(
      changeItemOwner(f.db, f.admin, {
        id: h.id,
        version: 1,
        owner: { ownerKind: "user", ownerId: f.anna.userId },
      }).version,
    ).toBe(2);
  });

  test("admin bulk reassignment of a leaving user's items", () => {
    const f = setupFixture();
    const a1 = f.item(f.anna, { name: "a1", owner: { ownerKind: "user", ownerId: f.anna.userId } });
    const a2 = f.item(f.anna, {
      name: "a2",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const b1 = f.item(f.ben, { name: "b1", owner: { ownerKind: "user", ownerId: f.ben.userId } });
    expect(
      code(() =>
        reassignUserItems(f.db, f.anna, {
          fromUserId: f.anna.userId,
          to: { ownerKind: "household" },
        }),
      ),
    ).toBe("ITEM_FORBIDDEN");
    expect(
      code(() =>
        reassignUserItems(f.db, f.admin, {
          fromUserId: f.anna.userId,
          to: { ownerKind: "user", ownerId: f.gast.userId },
        }),
      ),
    ).toBe("OWNER_INVALID");
    f.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, f.anna.userId)).run();
    expect(
      reassignUserItems(f.db, f.admin, {
        fromUserId: f.anna.userId,
        to: { ownerKind: "household" },
      }),
    ).toEqual({ count: 2 });
    for (const id of [a1.id, a2.id]) {
      const r = f.db.select().from(items).where(eq(items.id, id)).get()!;
      expect([r.ownerKind, r.ownerId, r.visibility]).toEqual(["household", null, "household"]);
      expect(
        f.db
          .select()
          .from(events)
          .where(eq(events.itemId, id))
          .all()
          .some((e) => e.action === "item.owner_changed"),
      ).toBe(true);
    }
    expect(f.db.select().from(items).where(eq(items.id, b1.id)).get()!.ownerId).toBe(f.ben.userId);
    expect(
      reassignUserItems(f.db, f.admin, {
        fromUserId: f.ben.userId,
        to: { ownerKind: "user", ownerId: f.admin.userId },
      }),
    ).toEqual({ count: 1 });
  });
});

describe("grants", () => {
  test("list, set, change and remove (manage), principal validation and guest ceiling", () => {
    const f = setupFixture();
    const a = f.item(f.anna, {
      name: "Kamera",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    expect(code(() => getItem(f.db, f.gast, a.id))).toBe("ITEM_NOT_FOUND");
    const base = { itemId: a.id, principalKind: "user" as const, principalId: f.gast.userId };
    expect(code(() => setItemGrant(f.db, f.anna, { ...base, level: "edit" }))).toBe(
      "GRANT_ABOVE_CEILING",
    );
    expect(setItemGrant(f.db, f.anna, { ...base, level: "view" })).toEqual([
      {
        principalKind: "user",
        principalId: f.gast.userId,
        name: "Gast",
        level: "view",
        isGuest: true,
      },
    ]);
    expect(getItem(f.db, f.gast, a.id).item.level).toBe("view");
    setItemGrant(f.db, f.anna, { ...base, level: "use" });
    setItemGrant(f.db, f.anna, {
      itemId: a.id,
      principalKind: "group",
      principalId: f.group.id,
      level: "edit",
    });
    expect(listItemGrants(f.db, f.anna, a.id).map((g) => [g.name, g.level])).toEqual([
      ["Gast", "use"],
      ["Kinder", "edit"],
    ]);
    expect(getItem(f.db, f.ben, a.id).item.level).toBe("edit");
    expect(code(() => setItemGrant(f.db, f.ben, { ...base, level: "view" }))).toBe(
      "ITEM_FORBIDDEN",
    );
    expect(
      code(() =>
        setItemGrant(f.db, f.anna, {
          itemId: a.id,
          principalKind: "group",
          principalId: "x",
          level: "view",
        }),
      ),
    ).toBe("GRANT_INVALID");
    removeItemGrant(f.db, f.anna, base);
    expect(code(() => getItem(f.db, f.gast, a.id))).toBe("ITEM_NOT_FOUND");
    const actions = f.db
      .select()
      .from(events)
      .where(eq(events.itemId, a.id))
      .all()
      .map((e) => e.action);
    expect(actions.filter((x) => x === "item.grant_set")).toHaveLength(3);
    expect(actions).toContain("item.grant_removed");
  });
});

describe("invisible items answer like missing ones (404, never 403)", () => {
  test("every item function", () => {
    const s = scenario();
    const { f, ids } = s;
    const missing = "does-not-exist";
    for (const id of [ids.AP, missing]) {
      for (const op of OPS)
        expect(`${op.name}: ${code(() => op.run(s, f.gast, id))}`).toBe(
          `${op.name}: ITEM_NOT_FOUND`,
        );
    }
    const ap = f.db.select().from(items).where(eq(items.id, ids.AP)).get()!;
    expect(code(() => resolveShortCode(f.db, f.gast, ap.shortCode!))).toBe("SHORT_CODE_NOT_FOUND");
    expect(code(() => resolveShortCode(f.db, f.gast, "ZZZZZZ"))).toBe("SHORT_CODE_NOT_FOUND");
    // A visible item cannot be used to reach an invisible container.
    const box = f.item(f.anna, {
      name: "Geheime Kiste",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      visibility: "private",
    });
    const h = f.item(f.anna, { name: "Zange" });
    expect(
      code(() => moveItem(f.db, f.ben, { id: h.id, version: 1, containerItemId: box.id })),
    ).toBe("CONTAINER_NOT_FOUND");
  });
});

describe("serialization below edit", () => {
  test("detail and list rows carry no price and no receipts for viewers", () => {
    const f = setupFixture();
    const a = f.item(f.anna, {
      name: "Fernseher",
      owner: { ownerKind: "user", ownerId: f.anna.userId },
      priceCents: 89900,
    });
    seed(f.db, {
      attachments: [
        { id: "att-photo", itemId: a.id, kind: "photo" },
        { id: "att-receipt", itemId: a.id, kind: "receipt" },
      ],
    });
    const viewer = getItem(f.db, f.ben, a.id);
    expect(viewer.item.level).toBe("view");
    expect("priceCents" in viewer.item).toBe(false);
    expect("currency" in viewer.item).toBe(false);
    expect(viewer.attachments.map((x) => x.id)).toEqual(["att-photo"]);
    expect(viewer.grants).toBeNull();
    expect(viewer.permissions).toEqual({
      canUse: false,
      canEdit: false,
      canManage: false,
      canChangeOwner: false,
    });
    const owner = getItem(f.db, f.anna, a.id);
    expect(owner.item.priceCents).toBe(89900);
    expect(owner.attachments.map((x) => x.id).sort()).toEqual(["att-photo", "att-receipt"]);

    const row = searchItems(f.db, f.ben, { q: "fernseher" }).items[0]!;
    expect(row.level).toBe("view");
    expect("priceCents" in row).toBe(false);
    expect("currency" in row).toBe(false);
    expect(row.photoId).toBe("att-photo");
    expect(searchItems(f.db, f.anna, { q: "fernseher" }).items[0]!.priceCents).toBe(89900);
    expect(JSON.stringify(searchItems(f.db, f.ben, { q: "fernseher" }))).not.toContain("89900");
    expect(JSON.stringify(viewer)).not.toContain("89900");
  });
});

describe("delete", () => {
  test("contents stay where the container was; index and grants are cleaned up", () => {
    const f = setupFixture();
    const loc = createLocation(f.db, f.anna, { name: "Keller" });
    const mine = { ownerKind: "user" as const, ownerId: f.anna.userId };
    const box = f.item(f.anna, { name: "Kiste", locationId: loc.id, owner: mine });
    const inside = f.item(f.anna, { name: "Schraube", containerItemId: box.id });
    seed(f.db, { attachments: [{ id: "att-box", itemId: box.id, kind: "photo" }] });
    deleteItem(f.db, f.anna, { id: box.id, version: 1 });
    expect(
      f.db
        .select()
        .from(jobs)
        .all()
        .map((j) => j.payload),
    ).toEqual([{ sha256: "0".repeat(64) }]);
    const row = f.db.select().from(items).where(eq(items.id, inside.id)).get()!;
    expect([row.containerItemId, row.locationId, row.version]).toEqual([null, loc.id, 2]);
    expect(searchItems(f.db, f.anna, { q: "kiste" }).items).toHaveLength(0);
    const ev = f.db.select().from(events).where(eq(events.itemId, box.id)).all().at(-1)!;
    expect(ev.action).toBe("item.deleted");
    expect(
      f.db.select().from(attachments).where(eq(attachments.itemId, box.id)).all(),
    ).toHaveLength(0);
  });
});
