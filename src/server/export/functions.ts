// Server functions for /admin/export. The download itself is the server route
// GET /api/v1/export (src/routes/api/v1/export.ts).
import { createServerFn } from "@tanstack/solid-start";
import { authMiddleware } from "../auth/middleware";
import { getDb } from "../db/client";
import { getExportRegistry } from "./registry";
import { getExportInfo, reserveExport } from "./service";

export const getExportInfoFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) => getExportInfo(getDb(), ctx, getExportRegistry()));

/** Reserves the caller's export slot; open `${EXPORT_URL}?ticket=…` within a minute. */
export const reserveExportFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) => reserveExport(ctx, getExportRegistry()));
