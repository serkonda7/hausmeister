// What the export page needs: the caller's scope with a size estimate, the
// running export's progress, and a reservation for the download (registry.ts).
// Guests get 404 like every other export path (DESIGN §11).
import { count, eq, sql } from "drizzle-orm";
import type { ExportInfo } from "../../lib/export/types";
import { HttpError } from "../auth/context";
import { exportItemsWhere, exportScope } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { attachments, items } from "../db/schema";
import type { ExportRegistry } from "./registry";

/** Throws a coded error the page maps to German (EXPORT_BUSY / EXPORT_LIMIT). */
export class ExportError extends HttpError {
  constructor(code: "EXPORT_BUSY" | "EXPORT_LIMIT") {
    super(429, code);
    this.name = "ExportError";
  }
}

function requireExportScope(ctx: AuthCtx) {
  const scope = exportScope(ctx);
  if (scope === "none") throw new HttpError(404, "NOT_FOUND");
  return scope;
}

export function getExportInfo(db: AppDb, ctx: AuthCtx, registry: ExportRegistry): ExportInfo {
  const scope = requireExportScope(ctx);
  const where = exportItemsWhere(ctx, items);
  const itemCount = db.select({ n: count() }).from(items).where(where).get()?.n ?? 0;
  const files = db
    .select({ n: count(), bytes: sql<number>`coalesce(sum(${attachments.bytes}), 0)` })
    .from(attachments)
    .innerJoin(items, eq(items.id, attachments.itemId))
    .where(where)
    .get();
  const status = registry.status(ctx.userId);
  return {
    scope,
    estimate: {
      items: itemCount,
      attachments: files?.n ?? 0,
      fileBytes: Number(files?.bytes ?? 0),
    },
    active: status.active,
    last: status.last,
  };
}

export function reserveExport(ctx: AuthCtx, registry: ExportRegistry): { ticket: string } {
  requireExportScope(ctx);
  const r = registry.reserve(ctx.userId);
  if (typeof r === "string") throw new ExportError(r);
  return r;
}
