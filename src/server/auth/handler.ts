// HTTP entry for /api/auth/*: Better Auth's handler behind an allowlist of the
// endpoints the app uses, plus the per-username sign-in lockout (./lockout.ts)
// around POST /sign-in/username.
import { ACCOUNT_DISABLED, type Auth, ENABLED_AUTH_PATHS } from "./auth";
import {
  addTrustedUsername,
  DEVICE_COOKIE_MAX_AGE,
  LoginLockout,
  readCookie,
  trustedUsernames,
} from "./lockout";
import { normalizeUsername } from "./users";

/** Error code of the 429 answer while a username is locked. */
export const SIGN_IN_LOCKED = "TOO_MANY_ATTEMPTS";

const AUTH_BASE_PATH = "/api/auth";

/** Better Auth's answer to a wrong username or password (username plugin). */
export function invalidCredentials(): Response {
  return Response.json(
    { code: "INVALID_USERNAME_OR_PASSWORD", message: "Invalid username or password" },
    { status: 401 },
  );
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return typeof body?.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

export type AuthHandlerOptions = {
  auth: Auth;
  secret: string;
  origin: string;
  lockout?: LoginLockout;
};

export function createAuthHandler(opts: AuthHandlerOptions) {
  const lockout = opts.lockout ?? new LoginLockout();
  const https = new URL(opts.origin).protocol === "https:";
  const cookieName = https ? "__Host-hm.device" : "hm.device";

  async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Anything else Better Auth (or a future version of it) offers answers like
    // a disabled path. Account changes go through the app's own server functions.
    const path = url.pathname.startsWith(AUTH_BASE_PATH)
      ? url.pathname.slice(AUTH_BASE_PATH.length)
      : url.pathname;
    if (!ENABLED_AUTH_PATHS.has(path)) return new Response("Not Found", { status: 404 });
    if (request.method !== "POST" || path !== "/sign-in/username") {
      return opts.auth.handler(request);
    }
    // Only JSON bodies with a string username reach Better Auth, so the
    // lockout cannot be sidestepped with another body encoding.
    let username: string | undefined;
    try {
      const body = (await request.clone().json()) as { username?: unknown };
      if (typeof body?.username === "string") username = normalizeUsername(body.username);
    } catch {}
    if (!username) {
      return Response.json(
        { code: "INVALID_REQUEST", message: "Invalid request" },
        { status: 400 },
      );
    }

    const deviceCookie = readCookie(request.headers, cookieName);
    const trusted = trustedUsernames(deviceCookie, opts.secret).includes(username);
    const key = trusted ? `${username}\u0000trusted` : username;

    const state = lockout.check(key);
    if (state.locked) {
      return Response.json(
        { code: SIGN_IN_LOCKED, message: "Too many attempts" },
        { status: 429, headers: { "retry-after": String(Math.ceil(state.retryAfterMs / 1000)) } },
      );
    }

    let res = await opts.auth.handler(request);
    // A correct password for a disabled account answers like a wrong one and
    // counts toward the lockout, so a guessed password is not confirmed. The
    // login page tells everyone who fails to ask an admin if it keeps failing.
    if (res.status === 403 && (await errorCode(res)) === ACCOUNT_DISABLED)
      res = invalidCredentials();
    if (res.status === 401) lockout.fail(key);
    if (!res.ok) return res;

    lockout.succeed(key);
    const out = new Response(res.body, res);
    const value = addTrustedUsername(deviceCookie, opts.secret, username);
    out.headers.append(
      "set-cookie",
      `${cookieName}=${encodeURIComponent(value)}; Max-Age=${DEVICE_COOKIE_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${https ? "; Secure" : ""}`,
    );
    return out;
  }

  return Object.assign(handler, { lockout });
}

export type AuthHandler = ReturnType<typeof createAuthHandler>;
