import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { FieldDefinition } from "~/lib/item-types/fields";
import type { AuthCtx, Role } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { events, items, itemTypes, users } from "../db/schema";
import { createTestDb } from "../db/test-db";
import {
  archiveItemType,
  createItemType,
  deleteItemType,
  getItemType,
  ItemTypeError,
  listActiveUsers,
  listItemTypes,
  planItemTypeChange,
  prepareItemAttributes,
  previewItemTypeUpdate,
  typeIdsWithDescendants,
  updateItemType,
} from "./service";

let db: AppDb;
let admin: AuthCtx;
let anna: AuthCtx; // member, creator
let ben: AuthCtx; // other member
let gast: AuthCtx;

function addUser(username: string, role: Role, disabled = false): AuthCtx {
  const u = db
    .insert(users)
    .values({
      username,
      displayName: username[0]!.toUpperCase() + username.slice(1),
      authEmail: `${username}@users.invalid`,
      role,
      disabledAt: disabled ? new Date() : null,
    })
    .returning()
    .get();
  return { userId: u.id, role, groupIds: new Set() };
}

function addItem(
  typeId: string,
  createdBy: string | null,
  owner: { kind: "household" | "user" | "group"; id?: string } = { kind: "household" },
  attributes: Record<string, unknown> = {},
) {
  return db
    .insert(items)
    .values({
      typeId,
      name: "Ding",
      createdBy,
      ownerKind: owner.kind,
      ownerId: owner.id ?? null,
      attributes,
    })
    .returning()
    .get();
}

const toolFields: FieldDefinition[] = [
  { key: "brand", label: "Marke", kind: "text" },
  { key: "voltage", label: "Spannung", kind: "measure", units: ["V"] },
];

function create(
  ctx: AuthCtx,
  key: string,
  extra: Partial<Parameters<typeof createItemType>[2]> = {},
) {
  return createItemType(db, ctx, {
    key,
    name: key,
    icon: "tool",
    tracking: "individual",
    parentId: null,
    fields: toolFields,
    ...extra,
  }).id;
}

function update(ctx: AuthCtx, id: string, patch: Record<string, unknown> = {}) {
  const t = getItemType(db, ctx.role === "guest" ? admin : ctx, id);
  return updateItemType(db, ctx, {
    id,
    name: t.name,
    icon: t.icon,
    tracking: t.tracking,
    parentId: t.parentId,
    fields: t.fields,
    ...patch,
  });
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ItemTypeError) return `${e.status} ${e.code}`;
    throw e;
  }
  return "ok";
};

beforeEach(() => {
  db = createTestDb();
  admin = addUser("admin", "admin");
  anna = addUser("anna", "member");
  ben = addUser("ben", "member");
  gast = addUser("gast", "guest");
});

describe("create and read", () => {
  test("admins and members create, guests cannot; everyone reads", () => {
    expect(code(() => create(admin, "a"))).toBe("ok");
    expect(code(() => create(anna, "b"))).toBe("ok");
    expect(code(() => create(gast, "c"))).toBe("403 FORBIDDEN");
    for (const ctx of [admin, anna, ben, gast]) {
      const tree = listItemTypes(db, ctx);
      expect(tree.map((t) => t.key).sort()).toEqual(["a", "b"]);
    }
    const id = create(anna, "d");
    expect(getItemType(db, gast, id).canEdit).toBe(false);
    expect(getItemType(db, gast, id).editBlock).toBe("guest");
    expect(code(() => getItemType(db, gast, "missing"))).toBe("404 NOT_FOUND");
  });

  test("writes an event per change with item_id NULL", () => {
    const id = create(anna, "tool");
    update(anna, id, { name: "Werkzeug" });
    archiveItemType(db, anna, { id, archived: true });
    deleteItemType(db, anna, { id });
    const rows = db.select().from(events).all();
    expect(rows.map((e) => e.action)).toEqual([
      "item_type.created",
      "item_type.updated",
      "item_type.archived",
      "item_type.deleted",
    ]);
    expect(rows.every((e) => e.itemId === null && e.actorId === anna.userId)).toBe(true);
  });

  test("duplicate type keys and invalid input are rejected", () => {
    create(admin, "tool");
    expect(code(() => create(anna, "tool"))).toBe("409 KEY_TAKEN");
    expect(code(() => create(anna, "Tool"))).toBe("422 INVALID");
    expect(
      code(() =>
        create(anna, "x", { fields: [{ key: "a", label: "A", kind: "select", options: [] }] }),
      ),
    ).toBe("422 INVALID");
  });
});

describe("inheritance", () => {
  test("child inherits fields; collisions and cycles are refused", () => {
    const tool = create(admin, "tool");
    const power = create(admin, "power_tool", {
      parentId: tool,
      fields: [{ key: "battery", label: "Akku", kind: "text" }],
    });
    const d = getItemType(db, anna, power);
    expect(d.effectiveFields.map((f) => [f.key, f.inherited])).toEqual([
      ["brand", true],
      ["voltage", true],
      ["battery", false],
    ]);
    expect(d.ancestors.map((a) => a.id)).toEqual([tool]);
    expect(typeIdsWithDescendants(db, tool).sort()).toEqual([power, tool].sort());

    expect(
      code(() =>
        create(admin, "clash", {
          parentId: tool,
          fields: [{ key: "brand", label: "Marke", kind: "text" }],
        }),
      ),
    ).toBe("409 KEY_COLLISION");
    // a parent may not add a key a subtype already has
    expect(
      code(() =>
        update(admin, tool, {
          fields: [...toolFields, { key: "battery", label: "Akku", kind: "text" }],
        }),
      ),
    ).toBe("409 KEY_COLLISION");
    expect(code(() => update(admin, tool, { parentId: power }))).toBe("409 CYCLE");
    expect(code(() => update(admin, tool, { parentId: tool }))).toBe("409 CYCLE");
    expect(code(() => update(admin, tool, { parentId: "nope" }))).toBe("422 PARENT_NOT_FOUND");
  });
});

describe("member permissions (§3.5)", () => {
  test("creator may edit while only their own or household items use it", () => {
    const id = create(anna, "tool");
    addItem(id, anna.userId, { kind: "household" });
    addItem(id, anna.userId, { kind: "user", id: anna.userId });
    expect(code(() => update(anna, id, { name: "Werkzeug" }))).toBe("ok");
    expect(code(() => update(ben, id, { name: "x" }))).toBe("403 NOT_CREATOR");
    expect(code(() => update(gast, id, { name: "x" }))).toBe("403 FORBIDDEN");
    expect(code(() => archiveItemType(db, ben, { id, archived: true }))).toBe("403 NOT_CREATOR");
    expect(code(() => deleteItemType(db, ben, { id }))).toBe("403 NOT_CREATOR");
    expect(code(() => deleteItemType(db, gast, { id }))).toBe("403 FORBIDDEN");
  });

  for (const [what, setup] of [
    ["created by another user", (t: string) => addItem(t, ben.userId)],
    [
      "owned by another user",
      (t: string) => addItem(t, anna.userId, { kind: "user", id: ben.userId }),
    ],
    ["owned by a group", (t: string) => addItem(t, anna.userId, { kind: "group", id: "g1" })],
    ["whose creator was deleted", (t: string) => addItem(t, null)],
  ] as const) {
    test(`creator is blocked by an item ${what}, including in subtypes`, () => {
      const id = create(anna, "tool");
      const sub = create(admin, "sub", { parentId: id, fields: [] });
      setup(sub);
      expect(code(() => update(anna, id, { name: "x" }))).toBe("403 IN_USE_BY_OTHERS");
      expect(code(() => archiveItemType(db, anna, { id, archived: true }))).toBe(
        "403 IN_USE_BY_OTHERS",
      );
      expect(getItemType(db, anna, id).editBlock).toBe("in_use_by_others");
      expect(listItemTypes(db, anna).find((t) => t.id === id)?.canEdit).toBe(false);
      // admins are never blocked
      expect(code(() => update(admin, id, { name: "x" }))).toBe("ok");
    });
  }

  test("templates (created_by NULL) are admin-only", () => {
    const [t] = db
      .insert(itemTypes)
      .values({ key: "book", name: "Buch", tracking: "individual", fields: [] })
      .returning()
      .all();
    expect(code(() => update(anna, t!.id, { name: "x" }))).toBe("403 NOT_CREATOR");
    expect(code(() => update(admin, t!.id, { name: "Bücher" }))).toBe("ok");
  });
});

describe("archive and delete", () => {
  test("a used type can be archived but not deleted; archived types leave the add list", () => {
    const id = create(anna, "tool");
    addItem(id, anna.userId);
    expect(code(() => deleteItemType(db, anna, { id }))).toBe("409 HAS_ITEMS");
    archiveItemType(db, anna, { id, archived: true });
    expect(listItemTypes(db, anna, { includeArchived: false })).toEqual([]);
    expect(listItemTypes(db, anna)[0]?.archivedAt).toBeInstanceOf(Date);
    archiveItemType(db, anna, { id, archived: false });
    expect(listItemTypes(db, anna, { includeArchived: false }).length).toBe(1);
  });

  test("a type with subtypes cannot be deleted", () => {
    const id = create(admin, "tool");
    create(admin, "sub", { parentId: id, fields: [] });
    expect(code(() => deleteItemType(db, admin, { id }))).toBe("409 HAS_CHILDREN");
  });
});

describe("schema evolution", () => {
  test("removing a field hides it and keeps values", () => {
    const id = create(anna, "tool");
    const item = addItem(id, anna.userId, { kind: "household" }, { brand: "Bosch" });
    expect(update(anna, id, { fields: [toolFields[1]] })).toEqual({
      status: "saved",
      migratedItems: 0,
    });
    const t = getItemType(db, anna, id);
    expect(t.fields.map((f) => [f.key, f.hidden ?? false])).toEqual([
      ["voltage", false],
      ["brand", true],
    ]);
    const stored = db.select().from(items).where(eq(items.id, item.id)).get();
    expect(stored?.attributes).toEqual({ brand: "Bosch" });
  });

  test("kind change: preview, confirmation, one transaction with an event per item", () => {
    const id = create(anna, "tool");
    const a = addItem(
      id,
      anna.userId,
      { kind: "household" },
      { voltage: { value: 18, unit: "V" } },
    );
    const b = addItem(
      id,
      anna.userId,
      { kind: "household" },
      { voltage: { value: 12, unit: "V" } },
    );
    addItem(id, anna.userId, { kind: "household" }, { brand: "Makita" });
    const toSelect: FieldDefinition[] = [
      toolFields[0]!,
      { key: "voltage", label: "Spannung", kind: "select", options: ["12 V", "18 V"] },
    ];
    const input = {
      id,
      name: "tool",
      icon: "tool",
      tracking: "individual" as const,
      parentId: null,
      fields: toSelect,
    };
    const preview = previewItemTypeUpdate(db, anna, input);
    expect(preview).toEqual({
      affectedItems: 2,
      byKey: [{ key: "voltage", label: "Spannung", removed: 2, converted: 0 }],
    });
    expect(updateItemType(db, anna, input)).toEqual({ status: "confirm", preview });
    expect(getItemType(db, anna, id).fields[1]?.kind).toBe("measure");
    // stale confirmation (count changed) asks again
    expect(updateItemType(db, anna, { ...input, confirmAffected: 1 }).status).toBe("confirm");

    expect(updateItemType(db, anna, { ...input, confirmAffected: 2 })).toEqual({
      status: "saved",
      migratedItems: 2,
    });
    expect(getItemType(db, anna, id).fields[1]?.kind).toBe("select");
    const after = db.select().from(items).where(eq(items.id, a.id)).get();
    expect(after?.attributes).toEqual({});
    expect(after?.version).toBe(2);
    const migrated = db
      .select()
      .from(events)
      .where(eq(events.action, "item.attributes_migrated"))
      .all();
    expect(migrated.map((e) => e.itemId).sort()).toEqual([a.id, b.id].sort());
    expect(migrated[0]?.actorId).toBe(anna.userId);
    expect(migrated[0]?.diff).toMatchObject({ removed: ["voltage"] });
  });

  test("parent change migrates subtype items too", () => {
    const tool = create(admin, "tool");
    const other = create(admin, "other", {
      fields: [{ key: "voltage", label: "Spannung", kind: "integer" }],
    });
    const sub = create(admin, "sub", { parentId: tool, fields: [] });
    const it = addItem(
      sub,
      admin.userId,
      { kind: "household" },
      { voltage: { value: 18, unit: "V" } },
    );
    const p = previewItemTypeUpdate(db, admin, {
      id: sub,
      name: "sub",
      icon: "tool",
      tracking: "individual",
      parentId: other,
      fields: [],
    });
    expect(p.byKey).toEqual([{ key: "voltage", label: "Spannung", removed: 0, converted: 1 }]);
    const r = updateItemType(db, admin, {
      id: sub,
      name: "sub",
      icon: "tool",
      tracking: "stock",
      parentId: other,
      fields: [],
      confirmAffected: 1,
    });
    expect(r).toEqual({ status: "saved", migratedItems: 1 });
    expect(db.select().from(items).where(eq(items.id, it.id)).get()?.attributes).toEqual({
      voltage: 18,
    });
    expect(getItemType(db, admin, sub).tracking).toBe("stock");
  });

  test("planItemTypeChange: preview for moving an item to another type", () => {
    create(admin, "tool");
    const book = create(admin, "book", {
      fields: [
        { key: "isbn", label: "ISBN", kind: "isbn" },
        { key: "brand", label: "Verlag", kind: "text", required: true },
      ],
    });
    const plan = planItemTypeChange(db, {
      attributes: { brand: "Bosch", voltage: { value: 18, unit: "V" } },
      toTypeId: book,
    });
    expect(plan.kept).toEqual(["brand"]);
    expect(plan.legacy).toEqual(["voltage"]);
    expect(code(() => planItemTypeChange(db, { attributes: {}, toTypeId: "x" }))).toBe(
      "404 NOT_FOUND",
    );
  });
});

describe("items helpers", () => {
  test("prepareItemAttributes validates and checks user references", () => {
    const id = create(admin, "book", {
      fields: [
        { key: "read_by", label: "Gelesen von", kind: "user", multiple: true },
        { key: "year", label: "Jahr", kind: "integer" },
      ],
    });
    expect(
      prepareItemAttributes(db, { typeId: id, attributes: { read_by: [anna.userId], year: 2001 } }),
    ).toEqual({ ok: true, attributes: { read_by: [anna.userId], year: 2001 } });
    const bad = prepareItemAttributes(db, { typeId: id, attributes: { read_by: ["ghost"] } });
    expect(bad).toEqual({ ok: false, errors: { read_by: "Diese Person gibt es nicht." } });
  });

  test("listActiveUsers returns id and display name of active users only", () => {
    addUser("weg", "member", true);
    const list = listActiveUsers(db);
    expect(list.map((u) => u.displayName)).toEqual(["Admin", "Anna", "Ben", "Gast"]);
    expect(Object.keys(list[0]!).sort()).toEqual(["displayName", "id"]);
  });

  test("item counts are only reported to admins", () => {
    const id = create(anna, "tool");
    addItem(id, anna.userId);
    expect(listItemTypes(db, admin)[0]?.itemCount).toBe(1);
    expect(listItemTypes(db, anna)[0]?.itemCount).toBeNull();
  });
});
