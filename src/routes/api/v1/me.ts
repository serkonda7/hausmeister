import { createFileRoute } from "@tanstack/solid-router";
import { withAuth } from "~/server/auth/context";

// GET /api/v1/me -> the caller's AuthCtx (401 JSON when signed out).
export const Route = createFileRoute("/api/v1/me")({
  server: {
    handlers: {
      GET: withAuth((_args, ctx) =>
        Response.json({ userId: ctx.userId, role: ctx.role, groupIds: [...ctx.groupIds] }),
      ),
    },
  },
});
