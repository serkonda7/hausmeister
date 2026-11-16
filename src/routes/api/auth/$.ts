import { createFileRoute } from "@tanstack/solid-router";
import { getAuth } from "~/server/auth/context";

// Better Auth's HTTP API (sign-in, sign-out, session, passkeys) under /api/auth/*.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => getAuth().handler(request),
      POST: ({ request }) => getAuth().handler(request),
    },
  },
});
