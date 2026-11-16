// Property test (DESIGN §3.4, §11): on random data in a real SQLite database,
// the SQL predicates select exactly the rows itemLevel puts at or above the
// level, and the batch loader agrees with itemLevel. The data includes
// anomalies the app should never write but that could exist: guests recorded
// as owners, owners and grantees that were deleted, disabled users, user and
// group ids that collide, and several grants reaching one user via groups.
import { describe, expect, test } from "bun:test";
import { and, eq, not } from "drizzle-orm";
import fc from "fast-check";
import { loadAuthCtx } from "../auth/users";
import type { AppDb } from "../db/client";
import { type ItemGrant, itemGrants, items } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { exportItemsWhere } from "./actions";
import type { AuthCtx, Role } from "./ctx";
import { atLeast, itemLevel, ownsItem, type VisibleLevel } from "./levels";
import { itemLevels, loadItemForCtx } from "./load";
import { itemsAtLeastWhere, visibleItemsWhere } from "./predicates";
import { seed } from "./test-fixtures";

const NUM_RUNS = 400;

// One id namespace for users and groups so their ids can collide on purpose.
const IDS = ["a", "b", "c", "d", "e", "f"] as const;
const GHOST = "ghost"; // a deleted user or group: referenced, but no row exists
const ROLES: Role[] = ["admin", "member", "guest"];
const LEVELS: VisibleLevel[] = ["view", "use", "edit", "manage"];

const datasetArb = fc
  .record({
    users: fc.uniqueArray(
      fc.record({
        id: fc.constantFrom(...IDS),
        role: fc.constantFrom(...ROLES),
        disabled: fc.boolean(),
      }),
      { minLength: 1, maxLength: 5, selector: (u) => u.id },
    ),
    groups: fc.uniqueArray(fc.constantFrom(...IDS), { maxLength: 4 }),
  })
  .chain(({ users, groups }) => {
    const userIds = users.map((u) => u.id);
    const anyId = fc.constantFrom<string>(...IDS, GHOST);
    const members =
      groups.length === 0
        ? fc.constant([] as [string, string][])
        : fc.uniqueArray(fc.tuple(fc.constantFrom(...groups), fc.constantFrom(...userIds)), {
            maxLength: 12,
            selector: ([g, u]) => `${g}/${u}`,
          });
    const item = fc.oneof(
      fc.record({
        ownerKind: fc.constant("household" as const),
        ownerId: fc.constant(null),
        visibility: fc.constantFrom("household" as const, "private" as const),
      }),
      fc.record({
        ownerKind: fc.constantFrom("user" as const, "group" as const),
        ownerId: anyId,
        visibility: fc.constantFrom("household" as const, "private" as const),
      }),
    );
    const grant = fc.record({
      principalKind: fc.constantFrom("user" as const, "group" as const),
      principalId: anyId,
      level: fc.constantFrom(...LEVELS),
    });
    const itemsArb = fc.array(
      fc.record({
        item,
        grants: fc.uniqueArray(grant, {
          maxLength: 5,
          selector: (g) => `${g.principalKind}/${g.principalId}`,
        }),
      }),
      { maxLength: 20 },
    );
    return fc.record({
      users: fc.constant(users),
      groups: fc.constant(groups),
      members,
      items: itemsArb,
    });
  });

// Arbitrary ctxs (not necessarily consistent with the memberships in the DB);
// realistic ones come from loadAuthCtx below.
const ctxArb = fc.record({
  userId: fc.constantFrom<string>(...IDS, GHOST),
  role: fc.constantFrom(...ROLES),
  groupIds: fc.uniqueArray(fc.constantFrom<string>(...IDS, GHOST), { maxLength: 4 }),
});

type Dataset = typeof datasetArb extends fc.Arbitrary<infer T> ? T : never;

function build(data: Dataset): AppDb {
  const db = createTestDb();
  seed(db, {
    users: data.users,
    groups: data.groups,
    members: data.members,
    items: data.items.map((x, i) => ({ id: `item${i}`, ...x.item })),
    grants: data.items.flatMap((x, i) => x.grants.map((g) => ({ itemId: `item${i}`, ...g }))),
  });
  return db;
}

function allRows(db: AppDb) {
  const rows = db.select().from(items).all();
  const grants = db.select().from(itemGrants).all();
  const byItem = new Map<string, ItemGrant[]>();
  for (const g of grants) byItem.set(g.itemId, [...(byItem.get(g.itemId) ?? []), g]);
  return rows.map((item) => ({ item, grants: byItem.get(item.id) ?? [] }));
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

function checkCtx(db: AppDb, ctx: AuthCtx) {
  const data = allRows(db);
  const levels = new Map(data.map(({ item, grants }) => [item.id, itemLevel(ctx, item, grants)]));

  for (const m of LEVELS) {
    const want = data
      .filter(({ item }) => atLeast(levels.get(item.id)!, m))
      .map(({ item }) => item.id)
      .sort();
    const pred = itemsAtLeastWhere(ctx, m);
    const got = ids(db.select({ id: items.id }).from(items).where(pred).all());
    expect({ ctx: { ...ctx, groupIds: [...ctx.groupIds] }, min: m, ids: got }).toEqual({
      ctx: { ...ctx, groupIds: [...ctx.groupIds] },
      min: m,
      ids: want,
    });
    // Never NULL: NOT gives the exact complement.
    const complement = ids(db.select({ id: items.id }).from(items).where(not(pred)).all());
    expect(complement.length + got.length).toBe(data.length);
    expect(complement.filter((id) => got.includes(id))).toEqual([]);
  }

  const visible = ids(db.select({ id: items.id }).from(items).where(visibleItemsWhere(ctx)).all());
  expect(visible).toEqual(
    ids(db.select({ id: items.id }).from(items).where(itemsAtLeastWhere(ctx, "view")).all()),
  );

  // The batch function agrees with itemLevel (it only loads the ctx's grants).
  const batch = itemLevels(
    db,
    ctx,
    data.map((d) => d.item),
  );
  for (const { item } of data) expect(batch.get(item.id)).toBe(levels.get(item.id)!);

  // loadItemForCtx agrees too, and is null exactly below view.
  for (const { item } of data) {
    const lvl = levels.get(item.id)!;
    expect(loadItemForCtx(db, ctx, item.id)?.level ?? "none").toBe(lvl);
  }

  // Export: admin all, member owned + household-owned, guest nothing.
  const exportWant = data
    .filter(({ item }) =>
      ctx.role === "admin"
        ? true
        : ctx.role === "member" && (item.ownerKind === "household" || ownsItem(ctx, item)),
    )
    .map(({ item }) => item.id)
    .sort();
  expect(ids(db.select({ id: items.id }).from(items).where(exportItemsWhere(ctx)).all())).toEqual(
    exportWant,
  );
}

describe("visibleItemsWhere / itemsAtLeastWhere / itemLevels agree with itemLevel", () => {
  test(`random data and random ctxs (${NUM_RUNS} runs)`, () => {
    fc.assert(
      fc.property(datasetArb, fc.array(ctxArb, { minLength: 1, maxLength: 4 }), (data, ctxs) => {
        const db = build(data);
        try {
          for (const c of ctxs) checkCtx(db, { ...c, groupIds: new Set(c.groupIds) });
          // Realistic ctxs, from the DB, for every active user.
          for (const u of data.users) {
            const ctx = loadAuthCtx(db, u.id);
            if (u.disabled) expect(ctx).toBeNull();
            else checkCtx(db, ctx!);
          }
        } finally {
          db.$client.close();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  }, 120_000);
});

describe("composition", () => {
  test("predicate ANDs with other conditions and survives an item_grants join", () => {
    const db = createTestDb();
    seed(db, {
      users: [
        { id: "me", role: "member" },
        { id: "x", role: "member" },
      ],
      items: [
        { id: "p", ownerKind: "user", ownerId: "x", visibility: "private" },
        { id: "q", ownerKind: "user", ownerId: "x", visibility: "household" },
        { id: "r", ownerKind: "household", ownerId: null },
      ],
      grants: [
        { itemId: "p", principalKind: "user", principalId: "me", level: "use" },
        { itemId: "q", principalKind: "user", principalId: "x", level: "view" },
      ],
    });
    const ctx: AuthCtx = { userId: "me", role: "member", groupIds: new Set() };
    const rows = db
      .select({ id: items.id })
      .from(items)
      .where(and(visibleItemsWhere(ctx), eq(items.ownerKind, "user")))
      .all();
    expect(ids(rows)).toEqual(["p", "q"]);
    // Join with item_grants itself (the subquery refers to the outer items row).
    const joined = db
      .selectDistinct({ id: items.id })
      .from(items)
      .innerJoin(itemGrants, eq(itemGrants.itemId, items.id))
      .where(itemsAtLeastWhere(ctx, "use"))
      .all();
    expect(ids(joined)).toEqual(["p"]);
    db.$client.close();
  });
});
