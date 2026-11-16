import { createFileRoute } from "@tanstack/solid-router";
import { bootCount, sqliteVersion } from "~/server/db";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => {
        try {
          return Response.json({
            ok: true,
            bun: Bun.version,
            sqlite: sqliteVersion(),
            boots: bootCount(),
          });
        } catch (err) {
          return Response.json(
            { ok: false, error: String(err) },
            { status: 503 },
          );
        }
      },
    },
  },
});
