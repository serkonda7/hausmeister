// Which Better Auth endpoints are reachable over HTTP (ENABLED_AUTH_PATHS),
// and that the ones the app needs keep working behind the handler.
import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { passkeys, users } from "../db/schema";
import { ENABLED_AUTH_PATHS } from "./auth";
import {
  cookieHeader,
  createTestAuth,
  createTestUser,
  signInRequest,
  TEST_ORIGIN,
  TEST_PASSWORD,
} from "./test-helpers";
import { disableUser, enableUser } from "./users";

const WRONG = "wrong-password-123";

async function signedIn(role: "admin" | "member" | "guest" = "guest") {
  const t = createTestAuth();
  const u = await createTestUser(t.db, "gustav", role);
  const res = await signInRequest(t.handler, "gustav");
  expect(res.status).toBe(200);
  return { ...t, user: u, cookie: cookieHeader(res) };
}

function call(
  h: (r: Request) => Promise<Response>,
  path: string,
  opts: { method?: string; cookie?: string; body?: unknown } = {},
) {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST");
  return h(
    new Request(`${TEST_ORIGIN}/api/auth${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        origin: TEST_ORIGIN,
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
    }),
  );
}

describe("Better Auth endpoint allowlist", () => {
  test("/update-user is closed for a signed-in user and changes nothing", async () => {
    const { db, handler, auth, user, cookie } = await signedIn("guest");
    const body = {
      username: "neuer_name",
      displayUsername: "Neu",
      name: "x".repeat(5000),
      image: "https://example.com/x.png",
    };
    for (const h of [handler, auth.handler]) {
      const res = await call(h, "/update-user", { cookie, body });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not Found");
    }
    const row = db.select().from(users).where(eq(users.id, user.id)).get()!;
    expect(row.username).toBe("gustav");
    expect(row.displayName).toBe("gustav");
  });

  test("every endpoint outside the allowlist answers 404, even signed in", async () => {
    const { auth, handler, cookie } = await signedIn("admin");
    const paths = Object.values(auth.api as Record<string, { path?: string }>)
      .map((e) => e?.path)
      .filter((p): p is string => typeof p === "string" && p.startsWith("/"));
    expect(paths.length).toBeGreaterThan(30);
    const closed = paths.filter((p) => !ENABLED_AUTH_PATHS.has(p));
    expect(closed).toContain("/update-user");
    expect(closed).toContain("/verify-password");
    expect(closed).toContain("/unlink-account");
    for (const p of closed) {
      const concrete = p.replace(/:[a-zA-Z]+/g, "x");
      for (const method of ["GET", "POST"]) {
        const res = await call(handler, concrete, { method, cookie, body: {} });
        expect(`${method} ${concrete} ${res.status}`).toBe(`${method} ${concrete} 404`);
      }
    }
    // Every allowlisted path is a real Better Auth endpoint.
    for (const p of ENABLED_AUTH_PATHS) expect(paths).toContain(p);
  });

  test("the endpoints the app needs still work", async () => {
    const { db, handler, user, cookie } = await signedIn("member");

    const session = await call(handler, "/get-session", { cookie });
    expect(session.status).toBe(200);
    expect(((await session.json()) as { user: { id: string } }).user.id).toBe(user.id);

    expect((await call(handler, "/passkey/generate-register-options", { cookie })).status).toBe(
      200,
    );
    expect((await call(handler, "/passkey/generate-authenticate-options")).status).toBe(200);
    // Verification endpoints are reachable (a bogus credential is refused, not 404).
    for (const p of ["/passkey/verify-registration", "/passkey/verify-authentication"]) {
      const res = await call(handler, p, { cookie, body: { response: {} } });
      expect(res.status).not.toBe(404);
      expect(res.status).toBeLessThan(500);
    }

    const pk = db
      .insert(passkeys)
      .values({
        name: "Alt",
        publicKey: "pk",
        userId: user.id,
        credentialID: "cred",
        counter: 0,
        deviceType: "singleDevice",
        backedUp: false,
      })
      .returning()
      .get();
    const renamed = await call(handler, "/passkey/update-passkey", {
      cookie,
      body: { id: pk.id, name: "Handy" },
    });
    expect(renamed.status).toBe(200);
    expect(db.select().from(passkeys).where(eq(passkeys.id, pk.id)).get()?.name).toBe("Handy");
    const deleted = await call(handler, "/passkey/delete-passkey", { cookie, body: { id: pk.id } });
    expect(deleted.status).toBe(200);
    expect(db.select().from(passkeys).where(eq(passkeys.id, pk.id)).get()).toBeUndefined();

    const changed = await call(handler, "/change-password", {
      cookie,
      body: { currentPassword: TEST_PASSWORD, newPassword: "another-long-password" },
    });
    expect(changed.status).toBe(200);
    expect((await signInRequest(handler, "gustav", "another-long-password")).status).toBe(200);

    const out = await call(handler, "/sign-out", { cookie, body: {} });
    expect(out.status).toBe(200);
    const after = await call(handler, "/get-session", { cookie });
    expect(await after.json()).toBeNull();
  });
});

describe("disabled accounts at sign-in", () => {
  test("a correct password for a disabled account answers like a wrong one", async () => {
    const { db, handler } = createTestAuth();
    const u = await createTestUser(db, "anna");
    await createTestUser(db, "ben");
    disableUser(db, u.id);
    const right = await signInRequest(handler, "anna", TEST_PASSWORD);
    const wrong = await signInRequest(handler, "ben", WRONG);
    expect(right.status).toBe(401);
    expect(right.status).toBe(wrong.status);
    expect(await right.json()).toEqual(await wrong.json());
    expect(right.headers.getSetCookie()).toEqual([]);
  });

  test("correct-password attempts on a disabled account count toward the lockout", async () => {
    const { db, handler } = createTestAuth();
    const u = await createTestUser(db, "anna");
    disableUser(db, u.id);
    for (let i = 0; i < 5; i++)
      expect((await signInRequest(handler, "anna", TEST_PASSWORD)).status).toBe(401);
    enableUser(db, u.id);
    expect((await signInRequest(handler, "anna", TEST_PASSWORD)).status).toBe(429);
  });
});
