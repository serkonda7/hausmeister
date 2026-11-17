// Custom server entry (TanStack Start picks up src/server.ts). Rejects cross-site
// writes (CSRF) and adds security headers, including a nonce-based CSP for
// HTML pages (production; see server/http/csp.ts). Env validation and migrations run at
// process start in src/nitro/startup.ts.
import handler, { createServerEntry } from "@tanstack/solid-start/server-entry";
import { getEnv } from "./server/env";
import { applyCsp, newNonce, withCspNonce } from "./server/http/csp";
import { isCrossSiteWrite } from "./server/http/csrf";

const env = getEnv();

export default createServerEntry({
  async fetch(request) {
    if (isCrossSiteWrite(request, env.ORIGIN)) {
      return withSecurityHeaders(Response.json({ error: "Cross-site request" }, { status: 403 }));
    }
    if (!env.isProduction) return withSecurityHeaders(await handler.fetch(request));
    const nonce = newNonce();
    const response = await withCspNonce(nonce, () => handler.fetch(request));
    return withSecurityHeaders(response, nonce);
  },
});

function withSecurityHeaders(response: Response, nonce?: string): Response {
  // Some responses (e.g. redirects from fetch) have immutable headers.
  const res = new Response(response.body, response);
  const h = res.headers;
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "same-origin");
  h.set("X-Frame-Options", "DENY");
  // DESIGN §8.4: HSTS without includeSubDomains/preload.
  if (env.ORIGIN.startsWith("https://")) h.set("Strict-Transport-Security", "max-age=31536000");
  if (nonce) applyCsp(h, nonce);
  return res;
}
