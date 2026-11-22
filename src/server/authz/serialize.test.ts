// Serialization (money and receipts), load-or-nothing, attachments.
import { describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { alias, sqliteTable, text } from "drizzle-orm/sqlite-core";
import fc from "fast-check";
import { HttpError } from "../auth/context";
import { type Attachment, attachments, items, itemTypes } from "../db/schema";
import { createTestDb } from "../db/test-db";
import type { AuthCtx, Role } from "./ctx";
import { LEVELS, type Level } from "./levels";
import { itemLevels, loadItemForCtx, requireItemForCtx, withLevels } from "./load";
import { visibleItemsWhere } from "./predicates";
import {
  canReadAttachment,
  filterAttachments,
  loadAttachmentForCtx,
  type SerializedItem,
  serializeItem,
  serializeItemsForCtx,
} from "./serialize";
import { seed } from "./test-fixtures";

const PRICE = 987_654_321; // distinctive, so a leak shows up in JSON
const ME = "me";
const OTHER = "other";
const GRANT_LEVELS = ["view", "use", "edit", "manage"] as const;

/** One item per grant level, all someone else's and private, plus a receipt and a photo each. */
function fixture() {
  const db = createTestDb();
  seed(db, {
    users: [
      { id: ME, role: "member" },
      { id: OTHER, role: "member" },
    ],
    items: [
      ...GRANT_LEVELS.map((l) => ({
        id: `granted-${l}`,
        ownerKind: "user" as const,
        ownerId: OTHER,
        visibility: "private" as const,
        priceCents: PRICE,
        currency: "EUR",
      })),
      { id: "hidden", ownerKind: "user", ownerId: OTHER, visibility: "private", priceCents: PRICE },
      {
        id: "household",
        ownerKind: "household",
        ownerId: null,
        priceCents: PRICE,
        currency: "EUR",
      },
    ],
    grants: GRANT_LEVELS.map((l) => ({
      itemId: `granted-${l}`,
      principalKind: "user" as const,
      principalId: ME,
      level: l,
    })),
    attachments: [...GRANT_LEVELS.map((l) => `granted-${l}`), "hidden", "household"].flatMap(
      (itemId) => [
        { id: `${itemId}-receipt`, itemId, kind: "receipt" as const },
        { id: `${itemId}-photo`, itemId, kind: "photo" as const },
      ],
    ),
  });
  return db;
}

const ctx = (role: Role): AuthCtx => ({ userId: ME, role, groupIds: new Set() });
const rank = (l: Level) => LEVELS.indexOf(l);

describe("serializeItem", () => {
  for (const role of ["admin", "member", "guest"] as const) {
    test(`${role}: money and receipts appear exactly from edit up`, () => {
      const db = fixture();
      const c = ctx(role);
      const rows = db.select().from(items).where(visibleItemsWhere(c)).all();
      const levels = itemLevels(db, c, rows);
      for (const row of rows) {
        const level = levels.get(row.id)!;
        const atts = db.select().from(attachments).where(eq(attachments.itemId, row.id)).all();
        const out = serializeItem(row, level, { attachments: atts });
        const json = JSON.stringify(out);
        const money = rank(level) >= rank("edit");
        expect(out.level as Level).toBe(level);
        expect("priceCents" in out).toBe(money);
        expect("currency" in out).toBe(money);
        expect(json.includes(String(PRICE))).toBe(money);
        expect(json.includes("receipt")).toBe(money);
        expect(out.attachments?.some((a) => a.kind === "photo")).toBe(true);
        if (money) expect(out.priceCents).toBe(PRICE);
        // Guests are capped at use, whatever they were granted.
        if (role === "guest") expect(money).toBe(false);
      }
    });
  }

  test("guest with an edit or manage grant gets use and no money", () => {
    const db = fixture();
    const guest = ctx("guest");
    for (const id of ["granted-edit", "granted-manage"]) {
      const found = loadItemForCtx(db, guest, id)!;
      expect(found.level).toBe("use");
      const out = serializeItem(found.item, found.level);
      expect(out).not.toHaveProperty("priceCents");
      expect(out).not.toHaveProperty("currency");
    }
  });

  test("absent, not null, and identical for 'no price' and 'hidden price'", () => {
    type Row = { id: string; name: string; priceCents: number | null; currency: string | null };
    const base: Row = { id: "x", name: "n", priceCents: null, currency: null };
    const withPrice: Row = { ...base, priceCents: 5, currency: "EUR" };
    expect(serializeItem(base, "use")).toEqual(serializeItem(withPrice, "use"));
    expect(serializeItem(base, "edit")).toEqual({ ...base, level: "edit" });
  });

  test("refuses level none", () => {
    expect(() => serializeItem({ id: "x" }, "none")).toThrow();
  });

  test("drops attachments of other items and a forged level field on the row", () => {
    const att = (id: string, itemId: string): Attachment => ({
      id,
      itemId,
      kind: "photo",
      sha256: "0",
      mime: "image/jpeg",
      bytes: 1,
      originalName: null,
      sort: 0,
      createdBy: null,
      createdAt: new Date(0),
    });
    const out = serializeItem({ id: "x", level: "manage" }, "view", {
      attachments: [att("a", "x"), att("b", "y")],
    });
    expect(out.level).toBe("view");
    expect(out.attachments?.map((a) => a.id)).toEqual(["a"]);
  });

  test("property: for any row and level, money keys are present iff level >= edit", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Level>("view", "use", "edit", "manage"),
        fc.option(fc.integer()),
        fc.option(fc.string()),
        (level, priceCents, currency) => {
          const out = serializeItem({ id: "x", priceCents, currency }, level);
          const money = rank(level) >= rank("edit");
          expect(Object.keys(out).sort()).toEqual(
            money ? ["currency", "id", "level", "priceCents"] : ["id", "level"],
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  test("serializeItemsForCtx serializes a list page with per-row levels", () => {
    const db = fixture();
    const c = ctx("member");
    const out = serializeItemsForCtx(
      db,
      c,
      db.select().from(items).where(visibleItemsWhere(c)).orderBy(items.id).all(),
    );
    expect(out.map((o) => [o.id, o.level, "priceCents" in o])).toEqual([
      ["granted-edit", "edit", true],
      ["granted-manage", "manage", true],
      ["granted-use", "use", false],
      ["granted-view", "view", false],
      ["household", "edit", true],
    ]);
  });

  test("withLevels drops rows below the minimum (safety net)", () => {
    const db = fixture();
    const rows = db.select().from(items).all(); // deliberately unfiltered
    const got = withLevels(db, ctx("member"), rows, "edit").map((r) => r.item.id);
    expect(got.sort()).toEqual(["granted-edit", "granted-manage", "household"]);
  });
});

describe("attachments", () => {
  test("filterAttachments / canReadAttachment", () => {
    const list = [
      { kind: "photo" as const },
      { kind: "receipt" as const },
      { kind: "manual" as const },
    ];
    expect(filterAttachments(list, "none")).toEqual([]);
    expect(filterAttachments(list, "view").map((a) => a.kind)).toEqual(["photo", "manual"]);
    expect(filterAttachments(list, "use").map((a) => a.kind)).toEqual(["photo", "manual"]);
    expect(filterAttachments(list, "edit")).toHaveLength(3);
    expect(canReadAttachment("manage", { kind: "receipt" })).toBe(true);
  });

  test("loadAttachmentForCtx for the files route", () => {
    const db = fixture();
    const m = ctx("member");
    expect(loadAttachmentForCtx(db, m, "granted-view-photo")?.level).toBe("view");
    expect(loadAttachmentForCtx(db, m, "granted-view-receipt")).toBeNull();
    expect(loadAttachmentForCtx(db, m, "granted-use-receipt")).toBeNull();
    expect(loadAttachmentForCtx(db, m, "granted-edit-receipt")?.attachment.kind).toBe("receipt");
    // Invisible item and nonexistent attachment look the same.
    expect(loadAttachmentForCtx(db, m, "hidden-photo")).toBeNull();
    expect(loadAttachmentForCtx(db, m, "nope")).toBeNull();
    const g = ctx("guest");
    expect(loadAttachmentForCtx(db, g, "granted-manage-receipt")).toBeNull();
    expect(loadAttachmentForCtx(db, g, "granted-manage-photo")?.level).toBe("use");
    expect(loadAttachmentForCtx(db, ctx("admin"), "hidden-receipt")?.level).toBe("manage");
  });
});

describe("load or nothing", () => {
  test("invisible and nonexistent items are indistinguishable", () => {
    const db = fixture();
    const m = ctx("member");
    expect(loadItemForCtx(db, m, "hidden")).toBeNull();
    expect(loadItemForCtx(db, m, "does-not-exist")).toBeNull();
    const err = (id: string) => {
      try {
        requireItemForCtx(db, m, id, "manage");
      } catch (e) {
        return e instanceof HttpError ? { status: e.status, message: e.message } : e;
      }
    };
    expect(err("hidden")).toEqual({ status: 404, message: "Not found" });
    expect(err("does-not-exist")).toEqual(err("hidden"));
  });

  test("below the minimum: null from loadItemForCtx, 403 from requireItemForCtx", () => {
    const db = fixture();
    const m = ctx("member");
    expect(loadItemForCtx(db, m, "granted-use", "edit")).toBeNull();
    expect(loadItemForCtx(db, m, "granted-use", "use")?.level).toBe("use");
    expect(() => requireItemForCtx(db, m, "granted-use", "edit")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(requireItemForCtx(db, m, "granted-edit", "edit").level).toBe("edit");
  });
});

describe("predicate composition", () => {
  // The FTS table is not in the Drizzle schema; declare enough of it to join.
  const itemsFts = sqliteTable("items_fts", { itemId: text("item_id"), name: text("name") });

  test("joins items_fts, item_types and an alias of items", () => {
    const db = fixture();
    for (const id of ["granted-view", "hidden", "household"])
      db.run(sql`insert into items_fts (item_id, name, description, tags, attrs)
                 values (${id}, 'akkuschrauber', '', '', '')`);
    const m = ctx("member");
    const hits = db
      .select({ id: items.id, type: itemTypes.name })
      .from(itemsFts)
      .innerJoin(items, eq(items.id, itemsFts.itemId))
      .innerJoin(itemTypes, eq(itemTypes.id, items.typeId))
      .where(and(sql`items_fts MATCH ${"schrauber"}`, visibleItemsWhere(m)))
      .all();
    expect(hits.map((h) => h.id).sort()).toEqual(["granted-view", "household"]);

    // Alias: containers the caller can see, joined with visible contents.
    const c = alias(items, "c");
    db.update(items).set({ containerItemId: "hidden" }).where(eq(items.id, "household")).run();
    db.update(items)
      .set({ containerItemId: "granted-view" })
      .where(eq(items.id, "granted-use"))
      .run();
    const pairs = db
      .select({ child: items.id, parent: c.id })
      .from(items)
      .innerJoin(c, eq(c.id, items.containerItemId))
      .where(and(visibleItemsWhere(m), visibleItemsWhere(m, c)))
      .all();
    expect(pairs).toEqual([{ child: "granted-use", parent: "granted-view" }]);
  });

  test("works in a count and an update", () => {
    const db = fixture();
    const m = ctx("member");
    const [{ n }] = db
      .select({ n: sql<number>`count(*)` })
      .from(items)
      .where(visibleItemsWhere(m))
      .all();
    expect(n).toBe(5);
    const changed = db
      .update(items)
      .set({ condition: "ok" })
      .where(visibleItemsWhere(m))
      .returning({ id: items.id })
      .all();
    expect(changed).toHaveLength(5);
  });
});

describe("types", () => {
  test("a raw row is not a SerializedItem; low levels carry no price", () => {
    const row = { id: "x", priceCents: 1, currency: "EUR" };
    // @ts-expect-error a raw row has no level
    const leak: SerializedItem<typeof row> = row;
    const out = serializeItem(row, "view");
    if (out.level === "view" || out.level === "use") {
      // @ts-expect-error priceCents is `never` below edit
      const p: number = out.priceCents;
      expect(p).toBeUndefined();
    }
    expect(Object.is(leak, row)).toBe(true);
  });
});
