import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { authCtxFromHeaders, HttpError } from "../auth/context";
import { createInvite, listPendingInvites, revokeInvite } from "../auth/invites";
import {
  cookieHeader,
  createTestAuth,
  createTestUser,
  signInRequest,
  TEST_ORIGIN,
} from "../auth/test-helpers";
import { loadAuthCtx } from "../auth/users";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { groupMembers, groups, itemGrants, items, itemTypes, users } from "../db/schema";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listGroups,
  removeGroupMember,
  renameGroup,
} from "./groups";
import {
  changeRole,
  listUserOptions,
  listUsers,
  resetUserPassword,
  setUserDisabled,
} from "./users";

const ctxOf = (db: AppDb, id: string) => loadAuthCtx(db, id) as AuthCtx;

async function family() {
  const { db, auth, handler } = createTestAuth();
  const admin = await createTestUser(db, "admin", "admin");
  const member = await createTestUser(db, "member", "member");
  const guest = await createTestUser(db, "guest", "guest");
  return {
    db,
    auth,
    handler,
    admin,
    member,
    guest,
    adminCtx: ctxOf(db, admin.id),
    memberCtx: ctxOf(db, member.id),
    guestCtx: ctxOf(db, guest.id),
  };
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof HttpError ? `${e.status} ${e.message}` : String(e);
  }
}

async function codeOfAsync(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof HttpError ? `${e.status} ${e.message}` : String(e);
  }
}

describe("role enforcement on every admin operation", () => {
  // Each entry calls one admin service with a given ctx. Keep this list in
  // sync with src/server/admin/functions.ts (one entry per server function).
  type Op = (
    db: AppDb,
    ctx: AuthCtx,
    ids: { user: string; group: string; invite: string },
  ) => unknown;
  const OPS: Record<string, Op> = {
    adminListUsers: (db, ctx) => listUsers(db, ctx),
    adminChangeRole: (db, ctx, ids) => changeRole(db, ctx, { userId: ids.user, role: "admin" }),
    adminSetUserDisabled: (db, ctx, ids) =>
      setUserDisabled(db, ctx, { userId: ids.user, disabled: true }),
    adminResetPassword: (db, ctx, ids) =>
      resetUserPassword(db, ctx, { userId: ids.user, password: "new-password-123" }),
    adminListUserOptions: (db, ctx) => listUserOptions(db, ctx),
    adminCreateInvite: (db, ctx) => createInvite(db, ctx, { role: "admin" }, TEST_ORIGIN),
    adminListInvites: (db, ctx) => listPendingInvites(db, ctx),
    adminRevokeInvite: (db, ctx, ids) => revokeInvite(db, ctx, ids.invite),
    adminListGroups: (db, ctx) => listGroups(db, ctx),
    adminCreateGroup: (db, ctx) => createGroup(db, ctx, { name: "Neu" }),
    adminRenameGroup: (db, ctx, ids) => renameGroup(db, ctx, { groupId: ids.group, name: "X" }),
    adminAddGroupMember: (db, ctx, ids) =>
      addGroupMember(db, ctx, { groupId: ids.group, userId: ids.user }),
    adminRemoveGroupMember: (db, ctx, ids) =>
      removeGroupMember(db, ctx, { groupId: ids.group, userId: ids.user }),
    adminDeleteGroup: (db, ctx, ids) => deleteGroup(db, ctx, { groupId: ids.group }),
  };

  test("the list covers every exported server function", async () => {
    const src = await Bun.file(new URL("./functions.ts", import.meta.url)).text();
    const exported = [...src.matchAll(/export const (\w+) = createServerFn/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(Object.keys(OPS).sort());
    // And each of them is behind roleMiddleware("admin").
    const blocks = src.split("export const ").slice(1);
    for (const b of blocks) expect(b).toContain(".middleware([admin])");
    expect(src).toContain('const admin = roleMiddleware("admin")');
  });

  for (const role of ["member", "guest"] as const) {
    test(`${role} is refused (403) and nothing changes`, async () => {
      const f = await family();
      const g = createGroup(f.db, f.adminCtx, { name: "Garage" });
      const inv = createInvite(f.db, f.adminCtx, { role: "member" }, TEST_ORIGIN);
      const ids = { user: f.member.id, group: g.id, invite: inv.id };
      const ctx = role === "member" ? f.memberCtx : f.guestCtx;
      for (const [name, op] of Object.entries(OPS)) {
        expect(`${name}: ${await codeOfAsync(async () => op(f.db, ctx, ids))}`).toBe(
          `${name}: 403 Forbidden`,
        );
      }
      expect(listGroups(f.db, f.adminCtx).map((x) => x.name)).toEqual(["Garage"]);
      expect(listPendingInvites(f.db, f.adminCtx)).toHaveLength(1);
      expect(ctxOf(f.db, f.member.id).role).toBe("member");
    });
  }

  test("admin may run every operation", async () => {
    const f = await family();
    const g = createGroup(f.db, f.adminCtx, { name: "Garage" });
    const inv = createInvite(f.db, f.adminCtx, { role: "member" }, TEST_ORIGIN);
    const ids = { user: f.member.id, group: g.id, invite: inv.id };
    for (const [name, op] of Object.entries(OPS)) {
      if (name === "adminCreateGroup") continue; // "Neu" is fine but irrelevant here
      expect(`${name}: ${await codeOfAsync(async () => op(f.db, f.adminCtx, ids))}`).toBe(
        `${name}: null`,
      );
    }
  });
});

describe("user guards", () => {
  test("the last active admin cannot be demoted or disabled", async () => {
    const f = await family();
    expect(codeOf(() => changeRole(f.db, f.adminCtx, { userId: f.admin.id, role: "member" }))).toBe(
      "409 LAST_ADMIN",
    );
    // A second admin makes demotion possible …
    changeRole(f.db, f.adminCtx, { userId: f.member.id, role: "admin" });
    changeRole(f.db, f.adminCtx, { userId: f.admin.id, role: "member" });
    const boss = ctxOf(f.db, f.member.id);
    expect(boss.role).toBe("admin");
    // … and now the remaining admin is the last one again.
    expect(codeOf(() => changeRole(f.db, boss, { userId: f.member.id, role: "guest" }))).toBe(
      "409 LAST_ADMIN",
    );
  });

  test("a disabled admin does not count as active", async () => {
    const f = await family();
    const second = await createTestUser(f.db, "admin2", "admin");
    setUserDisabled(f.db, f.adminCtx, { userId: second.id, disabled: true });
    expect(codeOf(() => changeRole(f.db, f.adminCtx, { userId: f.admin.id, role: "member" }))).toBe(
      "409 LAST_ADMIN",
    );
    // Demoting the disabled admin is fine.
    expect(codeOf(() => changeRole(f.db, f.adminCtx, { userId: second.id, role: "member" }))).toBe(
      null,
    );
  });

  test("nobody can disable themselves", async () => {
    const f = await family();
    await createTestUser(f.db, "admin2", "admin");
    expect(
      codeOf(() => setUserDisabled(f.db, f.adminCtx, { userId: f.admin.id, disabled: true })),
    ).toBe("409 SELF_DISABLE");
    expect(ctxOf(f.db, f.admin.id)).not.toBeNull();
  });

  test("disable ends sessions, enable restores sign-in", async () => {
    const f = await family();
    const cookie = cookieHeader(await signInRequest(f.handler, "member"));
    const headers = new Headers({ cookie });
    expect(await authCtxFromHeaders(headers, f)).not.toBeNull();
    setUserDisabled(f.db, f.adminCtx, { userId: f.member.id, disabled: true });
    expect(await authCtxFromHeaders(headers, f)).toBeNull();
    expect((await signInRequest(f.handler, "member")).status).toBe(403);
    setUserDisabled(f.db, f.adminCtx, { userId: f.member.id, disabled: false });
    expect((await signInRequest(f.handler, "member")).status).toBe(200);
    const row = listUsers(f.db, f.adminCtx).find((u) => u.id === f.member.id)!;
    expect(row.disabled).toBe(false);
    expect(row.lastActiveAt).toBeInstanceOf(Date);
  });

  test("admin password reset ends that user's sessions and sets the new password", async () => {
    const f = await family();
    const cookie = cookieHeader(await signInRequest(f.handler, "member"));
    await resetUserPassword(f.db, f.adminCtx, {
      userId: f.member.id,
      password: "brand-new-password",
    });
    expect(await authCtxFromHeaders(new Headers({ cookie }), f)).toBeNull();
    expect((await signInRequest(f.handler, "member")).status).toBe(401);
    expect((await signInRequest(f.handler, "member", "brand-new-password")).status).toBe(200);
    expect(
      await codeOfAsync(() =>
        resetUserPassword(f.db, f.adminCtx, { userId: f.member.id, password: "short" }),
      ),
    ).toContain("PASSWORD_TOO_SHORT");
  });

  test("unknown users are 404", async () => {
    const f = await family();
    expect(codeOf(() => changeRole(f.db, f.adminCtx, { userId: "nope", role: "guest" }))).toBe(
      "404 NOT_FOUND",
    );
  });
});

describe("groups", () => {
  test("create, rename, members", async () => {
    const f = await family();
    const g = createGroup(f.db, f.adminCtx, { name: "  Eltern  " });
    expect(g.name).toBe("Eltern");
    expect(codeOf(() => createGroup(f.db, f.adminCtx, { name: "eltern" }))).toBe(
      "409 GROUP_NAME_TAKEN",
    );
    expect(codeOf(() => createGroup(f.db, f.adminCtx, { name: "   " }))).toBe(
      "422 GROUP_NAME_INVALID",
    );
    renameGroup(f.db, f.adminCtx, { groupId: g.id, name: "Eltern & Co" });
    addGroupMember(f.db, f.adminCtx, { groupId: g.id, userId: f.member.id });
    addGroupMember(f.db, f.adminCtx, { groupId: g.id, userId: f.member.id }); // idempotent
    addGroupMember(f.db, f.adminCtx, { groupId: g.id, userId: f.guest.id });
    expect(ctxOf(f.db, f.member.id).groupIds.has(g.id)).toBe(true);
    let row = listGroups(f.db, f.adminCtx)[0]!;
    expect(row.name).toBe("Eltern & Co");
    expect(row.members.map((m) => m.username).sort()).toEqual(["guest", "member"]);
    removeGroupMember(f.db, f.adminCtx, { groupId: g.id, userId: f.guest.id });
    row = listGroups(f.db, f.adminCtx)[0]!;
    expect(row.members.map((m) => m.username)).toEqual(["member"]);
    expect(codeOf(() => addGroupMember(f.db, f.adminCtx, { groupId: g.id, userId: "x" }))).toBe(
      "404 NOT_FOUND",
    );
  });

  test("delete removes grants and memberships; refused while the group owns items", async () => {
    const f = await family();
    const g = createGroup(f.db, f.adminCtx, { name: "Garage" });
    addGroupMember(f.db, f.adminCtx, { groupId: g.id, userId: f.member.id });
    const type = f.db.insert(itemTypes).values({ key: "tool", name: "Werkzeug" }).returning().get();
    const owned = f.db
      .insert(items)
      .values({ typeId: type.id, name: "Bohrer", ownerKind: "group", ownerId: g.id })
      .returning()
      .get();
    const shared = f.db.insert(items).values({ typeId: type.id, name: "Leiter" }).returning().get();
    f.db
      .insert(itemGrants)
      .values({ itemId: shared.id, principalKind: "group", principalId: g.id, level: "use" })
      .run();

    expect(codeOf(() => deleteGroup(f.db, f.adminCtx, { groupId: g.id }))).toBe(
      "409 GROUP_OWNS_ITEMS",
    );
    expect(listGroups(f.db, f.adminCtx)[0]?.ownedItems).toBe(1);

    f.db
      .update(items)
      .set({ ownerKind: "household", ownerId: null })
      .where(eq(items.id, owned.id))
      .run();
    deleteGroup(f.db, f.adminCtx, { groupId: g.id });
    expect(f.db.select().from(groups).all()).toEqual([]);
    expect(f.db.select().from(groupMembers).all()).toEqual([]);
    expect(f.db.select().from(itemGrants).all()).toEqual([]);
    expect(f.db.select().from(users).all()).toHaveLength(3);
  });
});
