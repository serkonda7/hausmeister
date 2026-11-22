// Table-driven tests for DESIGN §3.4. The expected levels come from a literal
// transcription of the design's table below, combined with the design's rule
// "take the maximum of all rules that apply, then cap it at the role's
// ceiling" using a rank list local to this file, not the module's helpers.
// Every case is checked against itemLevel, the SQL predicates, the batch
// itemLevels and loadItemForCtx.
import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { items } from "../db/schema";
import { createTestDb } from "../db/test-db";
import type { AuthCtx, Role } from "./ctx";
import { itemLevel } from "./levels";
import { itemLevels, loadItemForCtx } from "./load";
import { itemsAtLeastWhere } from "./predicates";
import { seed } from "./test-fixtures";

type Lvl = "none" | "view" | "use" | "edit" | "manage";
const ORDER: Lvl[] = ["none", "view", "use", "edit", "manage"];
const max = (a: Lvl, b: Lvl) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);
const min = (a: Lvl, b: Lvl) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

// --- DESIGN §3.4, transcribed ------------------------------------------------
type Cell = Lvl | "grants only" | "n/a (guests don't own items)";
type Row = "household-owned" | "owned by me / my group" | "others', household" | "others', private";
const TABLE: Record<Row, Record<Role, Cell>> = {
  "household-owned": { admin: "manage", member: "edit", guest: "grants only" },
  "owned by me / my group": {
    admin: "manage",
    member: "manage",
    guest: "n/a (guests don't own items)",
  },
  "others', household": { admin: "manage", member: "view", guest: "grants only" },
  "others', private": { admin: "manage", member: "grants only", guest: "grants only" },
};
const CEILING: Record<Role, Lvl> = { admin: "manage", member: "manage", guest: "use" };

function baseFromTable(row: Row, role: Role): Lvl {
  const cell = TABLE[row][role];
  if (cell === "grants only") return "none";
  // "n/a": the table has no value because guests should never own items. The
  // reference code does not gate ownership by role, so a guest recorded as
  // owner (a data anomaly) gets manage, then the ceiling (use) applies.
  if (cell === "n/a (guests don't own items)") return "manage";
  return cell;
}

function expected(role: Role, row: Row, effectiveGrant: Lvl): Lvl {
  // "An admin can do everything ... all items including private ones."
  if (role === "admin") return "manage";
  return min(max(baseFromTable(row, role), effectiveGrant), CEILING[role]);
}

// --- The combinations -----------------------------------------------------------
const ME = "me";
const MY_GROUP = "g-mine";
const MY_OTHER_GROUP = "g-mine-2";
const OTHER_USER = "someone";
const OTHER_GROUP = "g-other";

type Ownership = "household" | "mine" | "my group's" | "other user's" | "other group's";
const OWNERSHIPS: Record<
  Ownership,
  { ownerKind: "household" | "user" | "group"; ownerId: string | null }
> = {
  household: { ownerKind: "household", ownerId: null },
  mine: { ownerKind: "user", ownerId: ME },
  "my group's": { ownerKind: "group", ownerId: MY_GROUP },
  "other user's": { ownerKind: "user", ownerId: OTHER_USER },
  "other group's": { ownerKind: "group", ownerId: OTHER_GROUP },
};
const VISIBILITIES = ["household", "private"] as const;

function rowFor(o: Ownership, v: (typeof VISIBILITIES)[number]): Row {
  if (o === "household") return "household-owned";
  if (o === "mine" || o === "my group's") return "owned by me / my group";
  return v === "household" ? "others', household" : "others', private";
}

type G = { principalKind: "user" | "group"; principalId: string; level: Exclude<Lvl, "none"> };
type GrantCase = { name: string; grants: G[]; effective: Lvl };
const GRANT_LEVELS = ["view", "use", "edit", "manage"] as const;
const GRANT_CASES: GrantCase[] = [
  { name: "no grant", grants: [], effective: "none" },
  ...GRANT_LEVELS.map((l) => ({
    name: `${l} to me`,
    grants: [{ principalKind: "user" as const, principalId: ME, level: l }],
    effective: l,
  })),
  ...GRANT_LEVELS.map((l) => ({
    name: `${l} via my group`,
    grants: [{ principalKind: "group" as const, principalId: MY_GROUP, level: l }],
    effective: l,
  })),
  ...GRANT_LEVELS.map((l) => ({
    name: `${l} to someone else`,
    grants: [{ principalKind: "user" as const, principalId: OTHER_USER, level: l }],
    effective: "none" as const,
  })),
  ...GRANT_LEVELS.map((l) => ({
    name: `${l} to a group I am not in`,
    grants: [{ principalKind: "group" as const, principalId: OTHER_GROUP, level: l }],
    effective: "none" as const,
  })),
  // Combinations: the maximum wins.
  {
    name: "view to me + manage via my group",
    grants: [
      { principalKind: "user", principalId: ME, level: "view" },
      { principalKind: "group", principalId: MY_GROUP, level: "manage" },
    ],
    effective: "manage",
  },
  {
    name: "use via one group + edit via another group",
    grants: [
      { principalKind: "group", principalId: MY_GROUP, level: "use" },
      { principalKind: "group", principalId: MY_OTHER_GROUP, level: "edit" },
    ],
    effective: "edit",
  },
  {
    name: "manage to someone else + view to me",
    grants: [
      { principalKind: "user", principalId: OTHER_USER, level: "manage" },
      { principalKind: "user", principalId: ME, level: "view" },
    ],
    effective: "view",
  },
  {
    // A group whose id equals my user id must not count as a grant to me.
    name: "manage to a group whose id is my user id",
    grants: [{ principalKind: "group", principalId: ME, level: "manage" }],
    effective: "none",
  },
];

type Case = {
  id: string;
  ownership: Ownership;
  visibility: (typeof VISIBILITIES)[number];
  grantCase: GrantCase;
};
const CASES: Case[] = [];
for (const ownership of Object.keys(OWNERSHIPS) as Ownership[])
  for (const visibility of VISIBILITIES)
    for (const grantCase of GRANT_CASES)
      CASES.push({ id: `i${CASES.length}`, ownership, visibility, grantCase });

const ctxFor = (role: Role): AuthCtx => ({
  userId: ME,
  role,
  groupIds: new Set([MY_GROUP, MY_OTHER_GROUP]),
});

let db: AppDb;
beforeAll(() => {
  db = createTestDb();
  seed(db, {
    users: [
      { id: ME, role: "member" },
      { id: OTHER_USER, role: "member" },
    ],
    groups: [MY_GROUP, MY_OTHER_GROUP, OTHER_GROUP],
    members: [
      [MY_GROUP, ME],
      [MY_OTHER_GROUP, ME],
      [OTHER_GROUP, OTHER_USER],
    ],
    items: CASES.map((c) => ({ id: c.id, ...OWNERSHIPS[c.ownership], visibility: c.visibility })),
    grants: CASES.flatMap((c) => c.grantCase.grants.map((g) => ({ itemId: c.id, ...g }))),
  });
});

test("the table covers every combination", () => {
  // 5 ownerships x 2 visibilities x 21 grant cases, for each of 3 roles.
  expect(CASES.length).toBe(5 * 2 * GRANT_CASES.length);
  expect(GRANT_CASES.length).toBe(21);
});

for (const role of ["admin", "member", "guest"] as const) {
  describe(`role ${role}`, () => {
    for (const c of CASES) {
      const want = expected(role, rowFor(c.ownership, c.visibility), c.grantCase.effective);
      test(`${c.ownership}, ${c.visibility}, ${c.grantCase.name} -> ${want}`, () => {
        const ctx = ctxFor(role);
        const item = { id: c.id, ...OWNERSHIPS[c.ownership], visibility: c.visibility };
        const grants = c.grantCase.grants.map((g) => ({ itemId: c.id, ...g }));

        expect(itemLevel(ctx, item, grants)).toBe(want);
        expect(itemLevels(db, ctx, [item]).get(c.id)).toBe(want);

        for (const m of GRANT_LEVELS) {
          const hit = db
            .select({ id: items.id })
            .from(items)
            .where(and(eq(items.id, c.id), itemsAtLeastWhere(ctx, m)))
            .get();
          expect({ min: m, selected: !!hit }).toEqual({
            min: m,
            selected: ORDER.indexOf(want) >= ORDER.indexOf(m),
          });
        }

        const loaded = loadItemForCtx(db, ctx, c.id);
        expect(loaded?.level ?? "none").toBe(want);
      });
    }
  });
}

test("grants that name a different item are ignored by itemLevel", () => {
  const ctx = ctxFor("member");
  const item = {
    id: "x",
    ownerKind: "user" as const,
    ownerId: OTHER_USER,
    visibility: "private" as const,
  };
  expect(
    itemLevel(ctx, item, [
      { itemId: "y", principalKind: "user", principalId: ME, level: "manage" },
    ]),
  ).toBe("none");
});
