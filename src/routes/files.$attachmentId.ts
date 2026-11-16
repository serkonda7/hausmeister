import { createFileRoute } from "@tanstack/solid-router";
import { serveAttachment } from "~/server/attachments/serve";
import { getBlobStore } from "~/server/attachments/storage";
import { withAuth } from "~/server/auth/context";
import { getDb } from "~/server/db/client";

// GET /files/:attachmentId[?size=thumb][&download=1]: authorized file download
// (DESIGN §6). 404 for unknown ids, invisible items and receipts below `edit`.
export const Route = createFileRoute("/files/$attachmentId")({
  server: {
    handlers: {
      GET: withAuth<{ request: Request; params: { attachmentId: string } }>(
        ({ request, params }, ctx) =>
          serveAttachment(getDb(), ctx, getBlobStore(), request, params.attachmentId),
      ),
    },
  },
});
