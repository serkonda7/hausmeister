import { describe, expect, test } from "bun:test";
import { groupMembers, groups } from "../db/schema";
import { authCtxFromHeaders } from "./context";
import {
  cookieHeader,
  createTestAuth,
  createTestUser,
  signInRequest,
  TEST_ORIGIN,
} from "./test-helpers";
import { createUserWithPassword, disableUser, loadAuthCtx, type UserInputError } from "./users";

describe("loadAuthCtx", () => {
  test("loads role and group memberships", async () => {
    const { db } = createTestAuth();
    const anna = await createTestUser(db, "anna", "member");
    const g1 = db.insert(groups).values({ name: "Eltern" }).returning().get();
    const g2 = db.insert(groups).values({ name: "Garage" }).returning().get();
    db.insert(groups).values({ name: "Andere" }).run();
    db.insert(groupMembers)
      .values([
        { groupId: g1.id, userId: anna.id },
        { groupId: g2.id, userId: anna.id },
      ])
      .run();

    const ctx = loadAuthCtx(db, anna.id);
    expect(ctx).not.toBeNull();
    expect(ctx?.userId).toBe(anna.id);
    expect(ctx?.role).toBe("member");
    expect(ctx?.groupIds).toEqual(new Set([g1.id, g2.id]));
  });

  test("guest without groups gets an empty set; unknown user gets null", async () => {
    const { db } = createTestAuth();
    const g = await createTestUser(db, "oma", "guest");
    expect(loadAuthCtx(db, g.id)).toEqual({ userId: g.id, role: "guest", groupIds: new Set() });
    expect(loadAuthCtx(db, "nope")).toBeNull();
  });

  test("disabled users get null", async () => {
    const { db } = createTestAuth();
    const u = await createTestUser(db, "ben", "admin");
    disableUser(db, u.id);
    expect(loadAuthCtx(db, u.id)).toBeNull();
  });
});

describe("createUserWithPassword", () => {
  test("validates input and normalizes the username", async () => {
    const { db } = createTestAuth();
    const u = await createUserWithPassword(db, {
      username: "Lena.K",
      password: "long-enough-pw",
      displayName: " Lena ",
      role: "member",
    });
    expect(u.username).toBe("lena.k");
    expect(u.displayName).toBe("Lena");
    expect(u.email).toBeNull();
    const err = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: UserInputError) => e.code,
      );
    expect(
      await err(
        createUserWithPassword(db, {
          username: "LENA.K",
          password: "long-enough-pw",
          displayName: "x",
          role: "guest",
        }),
      ),
    ).toBe("USERNAME_TAKEN");
    expect(
      await err(
        createUserWithPassword(db, {
          username: "a b",
          password: "long-enough-pw",
          displayName: "x",
          role: "guest",
        }),
      ),
    ).toBe("USERNAME_INVALID");
    expect(
      await err(
        createUserWithPassword(db, {
          username: "abc",
          password: "short",
          displayName: "x",
          role: "guest",
        }),
      ),
    ).toBe("PASSWORD_TOO_SHORT");
  });
});

describe("Better Auth sign-in", () => {
  test("a created user signs in and the session resolves to an AuthCtx", async () => {
    const { db, auth } = createTestAuth();
    const u = await createTestUser(db, "anna", "admin");
    const res = await signInRequest(auth, "Anna");
    expect(res.status).toBe(200);
    const cookie = cookieHeader(res);
    expect(cookie).toContain("hm.session_token=");

    const ctx = await authCtxFromHeaders(new Headers({ cookie }), { auth, db });
    expect(ctx).toEqual({ userId: u.id, role: "admin", groupIds: new Set() });
  });

  test("wrong password is rejected", async () => {
    const { db, auth } = createTestAuth();
    await createTestUser(db, "anna");
    const res = await signInRequest(auth, "anna", "wrong-password-123");
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  test("a disabled user cannot sign in", async () => {
    const { db, auth } = createTestAuth();
    const u = await createTestUser(db, "anna");
    disableUser(db, u.id);
    const res = await signInRequest(auth, "anna");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe("ACCOUNT_DISABLED");
    expect(cookieHeader(res)).not.toContain("session_token=");
  });

  test("an existing session stops working once the user is disabled", async () => {
    const { db, auth } = createTestAuth();
    const u = await createTestUser(db, "anna");
    const cookie = cookieHeader(await signInRequest(auth, "anna"));
    const headers = new Headers({ cookie });
    expect(await authCtxFromHeaders(headers, { auth, db })).not.toBeNull();
    disableUser(db, u.id);
    expect(await authCtxFromHeaders(headers, { auth, db })).toBeNull();
  });

  test("public sign-up is impossible", async () => {
    const { auth } = createTestAuth();
    const res = await auth.handler(
      new Request(`${TEST_ORIGIN}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: TEST_ORIGIN },
        body: JSON.stringify({
          email: "x@example.com",
          password: "long-enough-pw",
          name: "X",
          username: "xx",
        }),
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("sign-in is rate limited per client IP", async () => {
    const { db, auth } = createTestAuth({ rateLimit: true });
    await createTestUser(db, "anna");
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await signInRequest(auth, "anna", "wrong-password-123", TEST_ORIGIN, {
        "x-forwarded-for": "100.64.0.9",
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    // Another client is unaffected.
    const other = await signInRequest(auth, "anna", undefined, TEST_ORIGIN, {
      "x-forwarded-for": "100.64.0.10",
    });
    expect(other.status).toBe(200);
  });

  test("https ORIGIN uses host-only __Host- cookies", async () => {
    const origin = "https://sub.example.de";
    const { db, auth } = createTestAuth({ origin });
    await createTestUser(db, "anna");
    const res = await signInRequest(auth, "anna", undefined, origin);
    expect(res.status).toBe(200);
    const sc = res.headers.getSetCookie().find((c) => c.includes("session_token="));
    expect(sc).toBeDefined();
    expect(sc).toStartWith("__Host-hm.session_token=");
    expect(sc).toMatch(/;\s*Secure/i);
    expect(sc).toMatch(/;\s*Path=\/(;|$)/i);
    expect(sc).toMatch(/;\s*SameSite=Lax/i);
    expect(sc).toMatch(/;\s*HttpOnly/i);
    expect(sc).not.toMatch(/Domain=/i);
  });
});
