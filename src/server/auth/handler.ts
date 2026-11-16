// HTTP entry for /api/auth/*: Better Auth's handler plus the per-username
// sign-in lockout (./lockout.ts) around POST /sign-in/username.
import type { Auth } from "./auth";
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
    if (request.method !== "POST" || !url.pathname.endsWith("/sign-in/username")) {
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

    const res = await opts.auth.handler(request);
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
