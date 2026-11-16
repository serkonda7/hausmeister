import { createFileRoute } from "@tanstack/solid-router";
import { getBlobStore } from "~/server/attachments/storage";
import { handleUploadRequest } from "~/server/attachments/upload";
import { withAuth } from "~/server/auth/context";
import { getDb } from "~/server/db/client";

// POST /api/v1/items/:itemId/attachments, multipart `file` + `kind` (one file).
// 201 { attachment } or { error: "ATTACHMENTS_…" | "Not found" | … }.
export const Route = createFileRoute("/api/v1/items/$itemId/attachments")({
  server: {
    handlers: {
      POST: withAuth<{ request: Request; params: { itemId: string } }>(({ request, params }, ctx) =>
        handleUploadRequest(getDb(), ctx, getBlobStore(), request, params.itemId),
      ),
    },
  },
});
