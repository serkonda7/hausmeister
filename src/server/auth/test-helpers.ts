// Test helpers for anything that needs auth: a Better Auth instance on an
// in-memory DB plus helpers to sign in through the real HTTP handler.
import type { Role } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { createTestDb } from "../db/test-db";
import { createAuth } from "./auth";
import { createUserWithPassword } from "./users";

export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_PASSWORD = "correct-horse-battery";

export function createTestAuth(opts: { db?: AppDb; origin?: string; rateLimit?: boolean } = {}) {
  const db = opts.db ?? createTestDb();
  const auth = createAuth({
    db,
    env: {
      ORIGIN: opts.origin ?? TEST_ORIGIN,
      BETTER_AUTH_SECRET: "test-secret-0123456789abcdefghijklmnop",
    },
    startCookies: false,
    rateLimit: opts.rateLimit ?? false,
  });
  return { db, auth };
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
  auth: ReturnType<typeof createTestAuth>["auth"],
  username: string,
  password = TEST_PASSWORD,
  origin = TEST_ORIGIN,
  headers: Record<string, string> = {},
) {
  return auth.handler(
    new Request(`${origin}/api/auth/sign-in/username`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify({ username, password }),
    }),
  );
}

/** Turns Set-Cookie headers of a response into a Cookie request header. */
export function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
