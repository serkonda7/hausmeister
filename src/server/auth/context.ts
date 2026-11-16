// Auth helpers that do not depend on the TanStack Start request context
// (safe to import from bun tests). Request-bound helpers live in ./session.ts.
import type { AuthCtx, Role } from "../authz/ctx";
import { type AppDb, getDb } from "../db/client";
import { getEnv } from "../env";
import { type Auth, createAuth } from "./auth";
import { type AuthHandler, createAuthHandler } from "./handler";
import { loadAuthCtx } from "./users";

let instance: Auth | undefined;

/** The process-wide Better Auth instance (on getDb()). */
export function getAuth(): Auth {
  instance ??= createAuth({ db: getDb(), env: getEnv() });
  return instance;
}

let handlerInstance: AuthHandler | undefined;

/** The /api/auth/* HTTP handler: Better Auth plus the per-username sign-in lockout. */
export function getAuthHandler(): AuthHandler {
  const env = getEnv();
  handlerInstance ??= createAuthHandler({
    auth: getAuth(),
    secret: env.BETTER_AUTH_SECRET,
    origin: env.ORIGIN,
  });
  return handlerInstance;
}

/** Thrown by require* helpers; server routes turn it into a Response (see withAuth). */
export class HttpError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422 | 429,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Resolves the AuthCtx for a set of request headers: valid session and an
 * active (not disabled) user, with role and group memberships loaded.
 */
export async function authCtxFromHeaders(
  headers: Headers,
  deps: { auth: Auth; db: AppDb } = { auth: getAuth(), db: getDb() },
): Promise<AuthCtx | null> {
  const session = await deps.auth.api.getSession({ headers });
  if (!session) return null;
  return loadAuthCtx(deps.db, session.user.id);
}

const perRequest = new WeakMap<Request, Promise<AuthCtx | null>>();

/** AuthCtx for a given Request, memoized per request object. */
export function authCtxFromRequest(request: Request): Promise<AuthCtx | null> {
  let p = perRequest.get(request);
  if (!p) {
    p = authCtxFromHeaders(request.headers);
    perRequest.set(request, p);
  }
  return p;
}

/** Throws HttpError(403) unless ctx has one of the roles. Returns ctx for chaining. */
export function requireRole(ctx: AuthCtx, ...roles: Role[]): AuthCtx {
  if (!roles.includes(ctx.role)) throw new HttpError(403, "Forbidden");
  return ctx;
}

export function httpErrorResponse(err: HttpError): Response {
  return Response.json({ error: err.message }, { status: err.status });
}

/**
 * Wraps a server-route handler: resolves ctx (401 JSON when signed out),
 * optionally checks roles, and maps HttpError to a JSON Response.
 */
export function withAuth<A extends { request: Request }>(
  handler: (args: A, ctx: AuthCtx) => Response | Promise<Response>,
  opts: { roles?: Role[] } = {},
): (args: A) => Promise<Response> {
  return async (args) => {
    try {
      const ctx = await authCtxFromRequest(args.request);
      if (!ctx) throw new HttpError(401, "Not authenticated");
      if (opts.roles) requireRole(ctx, ...opts.roles);
      return await handler(args, ctx);
    } catch (err) {
      if (err instanceof HttpError) return httpErrorResponse(err);
      throw err;
    }
  };
}
