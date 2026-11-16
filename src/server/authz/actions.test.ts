import { describe, expect, test } from "bun:test";
import { createTestDb } from "../db/test-db";
import { type AppAction, can, exportScope, requireCan } from "./actions";
import type { AuthCtx, Role } from "./ctx";
import { validateGrantPrincipal, validateOwner } from "./principals";
import { seed } from "./test-fixtures";

const ctx = (role: Role): AuthCtx => ({ userId: "u", role, groupIds: new Set() });

// DESIGN §3.5, transcribed (the item-type edit/delete row is the item-types module's).
const TABLE: Record<AppAction, Record<Role, boolean>> = {
  "users.manage": { admin: true, member: false, guest: false },
  "groups.manage": { admin: true, member: false, guest: false },
  "itemTypes.create": { admin: true, member: true, guest: false },
  "locations.create": { admin: true, member: true, guest: false },
  "items.create": { admin: true, member: true, guest: false },
  export: { admin: true, member: true, guest: false },
};

describe("app-level actions", () => {
  for (const [action, row] of Object.entries(TABLE) as [AppAction, Record<Role, boolean>][])
    for (const role of ["admin", "member", "guest"] as const)
      test(`${role} ${row[role] ? "may" : "may not"} ${action}`, () => {
        expect(can(ctx(role), action)).toBe(row[role]);
        if (row[role]) expect(requireCan(ctx(role), action)).toEqual(ctx(role));
        else
          expect(() => requireCan(ctx(role), action)).toThrow(
            expect.objectContaining({ status: 403 }),
          );
      });

  test("export scope", () => {
    expect(exportScope(ctx("admin"))).toBe("all");
    expect(exportScope(ctx("member"))).toBe("own_and_household");
    expect(exportScope(ctx("guest"))).toBe("none");
  });
});

describe("owners and grant principals", () => {
  const db = createTestDb();
  seed(db, {
    users: [
      { id: "m", role: "member" },
      { id: "a", role: "admin" },
      { id: "g", role: "guest" },
      { id: "off", role: "member", disabled: true },
    ],
    groups: ["grp"],
  });

  test.each([
    [{ ownerKind: "household" }, { ok: true, value: { ownerKind: "household", ownerId: null } }],
    [
      { ownerKind: "household", ownerId: null },
      { ok: true, value: { ownerKind: "household", ownerId: null } },
    ],
    [
      { ownerKind: "household", ownerId: "m" },
      { ok: false, error: "HOUSEHOLD_WITH_ID" },
    ],
    [
      { ownerKind: "user", ownerId: "m" },
      { ok: true, value: { ownerKind: "user", ownerId: "m" } },
    ],
    [
      { ownerKind: "user", ownerId: "a" },
      { ok: true, value: { ownerKind: "user", ownerId: "a" } },
    ],
    [
      { ownerKind: "user", ownerId: "g" },
      { ok: false, error: "USER_IS_GUEST" },
    ],
    [
      { ownerKind: "user", ownerId: "off" },
      { ok: false, error: "USER_DISABLED" },
    ],
    [
      { ownerKind: "user", ownerId: "nobody" },
      { ok: false, error: "USER_NOT_FOUND" },
    ],
    [{ ownerKind: "user" }, { ok: false, error: "ID_REQUIRED" }],
    [
      { ownerKind: "group", ownerId: "grp" },
      { ok: true, value: { ownerKind: "group", ownerId: "grp" } },
    ],
    [
      { ownerKind: "group", ownerId: "m" },
      { ok: false, error: "GROUP_NOT_FOUND" },
    ],
    [
      { ownerKind: "group", ownerId: "" },
      { ok: false, error: "ID_REQUIRED" },
    ],
    [
      { ownerKind: "tenant", ownerId: "x" },
      { ok: false, error: "OWNER_KIND_INVALID" },
    ],
  ] as const)("validateOwner(%o)", (input, want) => {
    // biome-ignore lint/suspicious/noExplicitAny: deliberately invalid input in one case
    expect(validateOwner(db, input as any)).toEqual(
      want as unknown as ReturnType<typeof validateOwner>,
    );
  });

  test.each([
    [{ principalKind: "user", principalId: "g" }, true],
    [{ principalKind: "user", principalId: "m" }, true],
    [{ principalKind: "group", principalId: "grp" }, true],
    [{ principalKind: "user", principalId: "off" }, "USER_DISABLED"],
    [{ principalKind: "user", principalId: "nobody" }, "USER_NOT_FOUND"],
    [{ principalKind: "group", principalId: "m" }, "GROUP_NOT_FOUND"],
    [{ principalKind: "user", principalId: "" }, "ID_REQUIRED"],
  ] as const)("validateGrantPrincipal(%o)", (input, want) => {
    const r = validateGrantPrincipal(db, input);
    expect(r.ok ? true : r.error).toBe(want);
  });
});
