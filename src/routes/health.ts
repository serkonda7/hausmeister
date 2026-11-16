import { createFileRoute } from "@tanstack/solid-router";
import { getDb } from "~/server/db";
import { dbStats } from "~/server/db/stats";

// Public, unauthenticated. deploy/restore-test.sh reads `ok` and `boots`.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => {
        try {
          const stats = dbStats(getDb());
          return Response.json({ ok: true, bun: Bun.version, ...stats });
        } catch (err) {
          return Response.json({ ok: false, error: String(err) }, { status: 503 });
        }
      },
    },
  },
});
