// Test helpers for anything that needs auth: a Better Auth instance on an
// in-memory DB plus helpers to sign in through the real HTTP handler.
import type { Role } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { createTestDb } from "../db/test-db";
import { type Auth, createAuth } from "./auth";
import { type AuthHandler, createAuthHandler } from "./handler";
import type { LoginLockout } from "./lockout";
import { createUserWithPassword } from "./users";

export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_PASSWORD = "correct-horse-battery";

export const TEST_SECRET = "test-secret-0123456789abcdefghijklmnop";

/**
 * Better Auth on an in-memory DB. `handler` is the production HTTP entry
 * (Better Auth + per-username lockout); `auth.handler` skips the lockout.
 */
export function createTestAuth(
  opts: { db?: AppDb; origin?: string; rateLimit?: boolean; lockout?: LoginLockout } = {},
) {
  const db = opts.db ?? createTestDb();
  const origin = opts.origin ?? TEST_ORIGIN;
  const auth = createAuth({
    db,
    env: { ORIGIN: origin, BETTER_AUTH_SECRET: TEST_SECRET },
    startCookies: false,
    rateLimit: opts.rateLimit ?? false,
  });
  const handler = createAuthHandler({ auth, secret: TEST_SECRET, origin, lockout: opts.lockout });
  return { db, auth, handler };
}

export function createTestUser(
  db: AppDb,
  username: string,
  role: Role = "member",
  password = TEST_PASSWORD,
) {
  return createUserWithPassword(db, { username, password, displayName: username, role });
}

/** POST /api/auth/sign-in/username through the handler. */
export function signInRequest(
  auth: Auth | AuthHandler,
  username: string,
  password = TEST_PASSWORD,
  origin = TEST_ORIGIN,
  headers: Record<string, string> = {},
) {
  const request = new Request(`${origin}/api/auth/sign-in/username`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...headers },
    body: JSON.stringify({ username, password }),
  });
  return typeof auth === "function" ? auth(request) : auth.handler(request);
}

/** Turns Set-Cookie headers of a response into a Cookie request header. */
export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
