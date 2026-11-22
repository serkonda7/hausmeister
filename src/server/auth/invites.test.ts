import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AuthCtx } from "../authz/ctx";
import { events, invites, users } from "../db/schema";
import { HttpError } from "./context";
import {
  acceptInvite,
  createInvite,
  ensureBootstrapInvite,
  hashInviteToken,
  InviteInvalidError,
  inviteStatus,
  listPendingInvites,
  revokeInvite,
} from "./invites";
import { createTestAuth, createTestUser, signInRequest, TEST_ORIGIN } from "./test-helpers";
import { loadAuthCtx, UserInputError } from "./users";

const DAY = 24 * 60 * 60 * 1000;
const tokenOf = (url: string) => url.split("/invite/")[1]!;

async function setup() {
  const { db, auth } = createTestAuth();
  const admin = await createTestUser(db, "admin", "admin");
  const ctx = loadAuthCtx(db, admin.id) as AuthCtx;
  return { db, auth, admin, ctx };
}

const accept = (token: string, username = "lena", password = "lenas-password-1") => ({
  token,
  username,
  displayName: "Lena",
  password,
});

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("invite lifecycle", () => {
  test("create stores only the hash and returns the link once", async () => {
    const { db, ctx } = await setup();
    const inv = createInvite(db, ctx, { role: "member" }, TEST_ORIGIN);
    expect(inv.url).toStartWith(`${TEST_ORIGIN}/invite/`);
    const token = tokenOf(inv.url);
    expect(token.length).toBeGreaterThanOrEqual(43);
    const row = db.select().from(invites).where(eq(invites.id, inv.id)).get()!;
    expect(row.tokenHash).toBe(hashInviteToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    // Default expiry: 7 days.
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(7 * DAY);
    expect(listPendingInvites(db, ctx).map((i) => i.id)).toEqual([inv.id]);
    expect(listPendingInvites(db, ctx)[0]).not.toHaveProperty("tokenHash");
  });

  test("accept creates the user with the invite's role and signs in", async () => {
    const { db, auth, ctx } = await setup();
    const inv = createInvite(db, ctx, { role: "guest" }, TEST_ORIGIN);
    expect(inviteStatus(db, tokenOf(inv.url))).toEqual({ role: "guest" });
    const user = await acceptInvite(db, accept(tokenOf(inv.url), "Oma.Inge"));
    expect(user.role).toBe("guest");
    expect(user.username).toBe("oma.inge");
    const row = db.select().from(invites).where(eq(invites.id, inv.id)).get()!;
    expect(row.acceptedAt).not.toBeNull();
    expect(row.acceptedBy).toBe(user.id);
    expect((await signInRequest(auth, "oma.inge", "lenas-password-1")).status).toBe(200);
    // Used: no longer pending, no longer usable.
    expect(listPendingInvites(db, ctx)).toEqual([]);
    expect(inviteStatus(db, tokenOf(inv.url))).toBeNull();
    expect(await rejection(acceptInvite(db, accept(tokenOf(inv.url), "other")))).toBeInstanceOf(
      InviteInvalidError,
    );
  });

  test("two simultaneous accepts: exactly one wins", async () => {
    const { db, ctx } = await setup();
    const token = tokenOf(createInvite(db, ctx, { role: "member" }, TEST_ORIGIN).url);
    const results = await Promise.allSettled([
      acceptInvite(db, accept(token, "first")),
      acceptInvite(db, accept(token, "second")),
      acceptInvite(db, accept(token, "third")),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(2);
    for (const f of failed) expect(f.reason).toBeInstanceOf(InviteInvalidError);
    // Only the admin plus one new user exist.
    expect(db.select().from(users).all()).toHaveLength(2);
    expect(db.select().from(events).where(eq(events.action, "invite.accepted")).all()).toHaveLength(
      1,
    );
  });

  test("expired invites are refused, even between check and claim", async () => {
    const { db, ctx } = await setup();
    const t0 = new Date("2026-01-01T00:00:00Z");
    const inv = createInvite(db, ctx, { role: "member", expiresInDays: 1 }, TEST_ORIGIN, t0);
    const token = tokenOf(inv.url);
    const after = new Date(t0.getTime() + DAY + 1);
    expect(inviteStatus(db, token, after)).toBeNull();
    expect(listPendingInvites(db, ctx, after)).toEqual([]);
    expect(await rejection(acceptInvite(db, accept(token), () => after))).toBeInstanceOf(
      InviteInvalidError,
    );
    // Valid at the pre-check, expired by the time the transaction claims it.
    let calls = 0;
    const clock = () => (calls++ === 0 ? new Date(t0.getTime() + 1000) : after);
    expect(await rejection(acceptInvite(db, accept(token), clock))).toBeInstanceOf(
      InviteInvalidError,
    );
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  test("revoked invites are refused like unknown ones", async () => {
    const { db, ctx } = await setup();
    const inv = createInvite(db, ctx, { role: "member" }, TEST_ORIGIN);
    revokeInvite(db, ctx, inv.id);
    expect(inviteStatus(db, tokenOf(inv.url))).toBeNull();
    expect(await rejection(acceptInvite(db, accept(tokenOf(inv.url))))).toBeInstanceOf(
      InviteInvalidError,
    );
    expect(await rejection(acceptInvite(db, accept("made-up-token")))).toBeInstanceOf(
      InviteInvalidError,
    );
    // Revoking twice (or an unknown id) is a 404.
    expect(() => revokeInvite(db, ctx, inv.id)).toThrow(HttpError);
  });

  test("invalid user input keeps the invite usable", async () => {
    const { db, ctx } = await setup();
    const token = tokenOf(createInvite(db, ctx, { role: "member" }, TEST_ORIGIN).url);
    const taken = await rejection(acceptInvite(db, accept(token, "ADMIN")));
    expect(taken).toBeInstanceOf(UserInputError);
    expect((taken as UserInputError).code).toBe("USERNAME_TAKEN");
    const short = await rejection(acceptInvite(db, { ...accept(token), password: "" }));
    expect((short as UserInputError).code).toBe("PASSWORD_TOO_SHORT");
    expect(inviteStatus(db, token)).toEqual({ role: "member" });
    expect((await acceptInvite(db, accept(token))).username).toBe("lena");
  });

  test("expiry must be 1..30 days", async () => {
    const { db, ctx } = await setup();
    for (const d of [0, 31, 1.5]) {
      expect(() =>
        createInvite(db, ctx, { role: "member", expiresInDays: d }, TEST_ORIGIN),
      ).toThrow("INVITE_EXPIRY_INVALID");
    }
  });
});

describe("bootstrap invite", () => {
  test("only while there are no users; a restart replaces the old link", async () => {
    const { db } = createTestAuth();
    const first = ensureBootstrapInvite(db, TEST_ORIGIN);
    expect(first).toStartWith(`${TEST_ORIGIN}/invite/`);
    const second = ensureBootstrapInvite(db, TEST_ORIGIN)!;
    expect(inviteStatus(db, tokenOf(first!))).toBeNull();
    expect(inviteStatus(db, tokenOf(second))).toEqual({ role: "admin" });
    const admin = await acceptInvite(db, accept(tokenOf(second), "chef"));
    expect(admin.role).toBe("admin");
    expect(ensureBootstrapInvite(db, TEST_ORIGIN)).toBeNull();
  });
});
