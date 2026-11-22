import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  removeGroupMember,
  renameGroup,
} from "./admin/groups";
import { changeRole, resetUserPassword, setUserDisabled } from "./admin/users";
import { findSecretKey, recordEvent } from "./audit";
import { acceptInvite, createInvite, ensureBootstrapInvite, revokeInvite } from "./auth/invites";
import { createTestAuth, TEST_ORIGIN } from "./auth/test-helpers";
import { loadAuthCtx } from "./auth/users";
import type { AuthCtx } from "./authz/ctx";
import { accounts, events, invites } from "./db/schema";

describe("audit events", () => {
  test("recordEvent refuses secret-looking keys at any depth", () => {
    const { db } = createTestAuth();
    expect(findSecretKey({ a: 1, nested: { newPassword: "x" } })).toBe("nested.newPassword");
    expect(findSecretKey({ tokenHash: "x" })).toBe("tokenHash");
    expect(findSecretKey({ userId: "u", role: "admin" })).toBeNull();
    expect(() =>
      recordEvent(db, { actorId: null, action: "user.password_reset", diff: { password: "x" } }),
    ).toThrow(/secret/);
  });

  test("every people flow logs its event, and no diff contains a secret", async () => {
    const { db } = createTestAuth();
    const secrets: string[] = [];
    const password = "first-admin-password";
    secrets.push(password);

    const boot = ensureBootstrapInvite(db, TEST_ORIGIN)!;
    const bootToken = boot.split("/invite/")[1]!;
    secrets.push(bootToken);
    const admin = await acceptInvite(db, {
      token: bootToken,
      username: "chef",
      displayName: "Chef",
      password,
    });
    const ctx = loadAuthCtx(db, admin.id) as AuthCtx;

    const inv = createInvite(db, ctx, { role: "member" }, TEST_ORIGIN);
    const token = inv.url.split("/invite/")[1]!;
    secrets.push(token);
    const memberPw = "member-password-1";
    secrets.push(memberPw);
    const member = await acceptInvite(db, {
      token,
      username: "lena",
      displayName: "Lena",
      password: memberPw,
    });
    const revoked = createInvite(db, ctx, { role: "guest" }, TEST_ORIGIN);
    secrets.push(revoked.url.split("/invite/")[1]!);
    revokeInvite(db, ctx, revoked.id);

    changeRole(db, ctx, { userId: member.id, role: "guest" });
    setUserDisabled(db, ctx, { userId: member.id, disabled: true });
    setUserDisabled(db, ctx, { userId: member.id, disabled: false });
    const resetPw = "reset-password-123";
    secrets.push(resetPw);
    await resetUserPassword(db, ctx, { userId: member.id, password: resetPw });

    const g = createGroup(db, ctx, { name: "Garage" });
    renameGroup(db, ctx, { groupId: g.id, name: "Werkstatt" });
    addGroupMember(db, ctx, { groupId: g.id, userId: member.id });
    removeGroupMember(db, ctx, { groupId: g.id, userId: member.id });
    deleteGroup(db, ctx, { groupId: g.id });

    // Stored hashes count as secrets too.
    for (const a of db.select().from(accounts).all()) if (a.password) secrets.push(a.password);
    for (const i of db.select().from(invites).all()) secrets.push(i.tokenHash);

    const rows = db.select().from(events).all();
    expect(rows.map((r) => r.action)).toEqual([
      "invite.created",
      "invite.accepted",
      "invite.created",
      "invite.accepted",
      "invite.created",
      "invite.revoked",
      "user.role_changed",
      "user.disabled",
      "user.enabled",
      "user.password_reset",
      "group.created",
      "group.renamed",
      "group.member_added",
      "group.member_removed",
      "group.deleted",
    ]);
    for (const r of rows) {
      expect(r.itemId).toBeNull();
      expect(r.at).toBeInstanceOf(Date);
      const json = JSON.stringify(r.diff);
      expect(findSecretKey(r.diff)).toBeNull();
      for (const s of secrets) expect(json).not.toContain(s);
      // Nothing that looks like a hash or token either.
      expect(json).not.toMatch(/[A-Za-z0-9_-]{40,}/);
    }
    // Actor: the bootstrap invite has none; the rest are attributed.
    expect(rows[0]?.actorId).toBeNull();
    expect(rows[1]?.actorId).toBe(admin.id);
    const roleEvent = db.select().from(events).where(eq(events.action, "user.role_changed")).get();
    expect(roleEvent?.actorId).toBe(admin.id);
    expect(roleEvent?.diff).toEqual({
      userId: member.id,
      username: "lena",
      from: "member",
      to: "guest",
    });
  });
});
