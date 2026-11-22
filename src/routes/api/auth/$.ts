import { createFileRoute } from "@tanstack/solid-router";
import { getAuthHandler } from "~/server/auth/context";

// Better Auth's HTTP API (sign-in, sign-out, session, passkeys) under /api/auth/*,
// with the per-username sign-in lockout in front (src/server/auth/handler.ts).
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => getAuthHandler()(request),
      POST: ({ request }) => getAuthHandler()(request),
    },
  },
});
