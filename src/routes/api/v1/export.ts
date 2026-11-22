import { createFileRoute } from "@tanstack/solid-router";
import { getBlobStore } from "~/server/attachments/storage";
import { withAuth } from "~/server/auth/context";
import { getDb } from "~/server/db/client";
import { handleExportRequest } from "~/server/export/handler";

// GET /api/v1/export[?ticket=…]: the caller's export as a streamed ZIP
// (admin: everything, member: own and household items; DESIGN §3.5).
// See src/server/export/handler.ts.
//
// Guests must not tell this URL from a missing one (DESIGN §11), so they get
// the router's not-found answer for a path no route matches (its body does
// not contain the path).
const NO_SUCH_PATH = "/__hausmeister_no_such_page__";

async function routerNotFound(request: Request): Promise<Response> {
  const { default: start } = await import("@tanstack/solid-start/server-entry");
  const url = new URL(NO_SUCH_PATH, request.url);
  return start.fetch(
    new Request(url, { method: request.method, headers: request.headers, signal: request.signal }),
  );
}

export const Route = createFileRoute("/api/v1/export")({
  server: {
    handlers: {
      GET: withAuth<{ request: Request }>(({ request }, ctx) =>
        handleExportRequest(getDb(), ctx, getBlobStore(), request, {
          notFound: () => routerNotFound(request),
        }),
      ),
    },
  },
});
