// Request-bound auth helpers for server functions, loaders and server routes.
// Server-only; import pure helpers from ./context in unit tests.
import { getRequest } from "@tanstack/solid-start/server";
import type { AuthCtx } from "../authz/ctx";
import { authCtxFromRequest, HttpError } from "./context";

export {
  authCtxFromHeaders,
  authCtxFromRequest,
  getAuth,
  HttpError,
  httpErrorResponse,
  requireRole,
  withAuth,
} from "./context";

/** AuthCtx of the current request (memoized per request), or null when signed out/disabled. */
export function getAuthCtx(): Promise<AuthCtx | null> {
  return authCtxFromRequest(getRequest());
}

/** Like getAuthCtx() but throws HttpError(401) when signed out. */
export async function requireAuthCtx(): Promise<AuthCtx> {
  const ctx = await getAuthCtx();
  if (!ctx) throw new HttpError(401, "Not authenticated");
  return ctx;
}
