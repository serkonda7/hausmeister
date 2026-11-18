// Scanned or typed codes (DESIGN §5.2): a label's short code opens its item or location; any other code (EAN, ISBN, a serial) finds the visible items that carry it, in the barcode column or as any attribute value.
// ISBNs match in both spellings (ISBN-10 and -13).
// Invisible items never match.
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { isBooklandEan, isbnVariants, toIsbn13 } from "../../lib/isbn";
import { normalizeIsbn } from "../../lib/item-types/fields";
import { shortCodeFromScan } from "../../lib/qr";
import type { CodeLookup } from "../../lib/scan/types";
import { isShortCode } from "../../lib/short-code";
import { visibleItemsWhere } from "../authz";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { items, itemTypes, locations } from "../db/schema";
import { ItemsError } from "../items/errors";
import { resolveShortCode } from "../items/service";
import { listColumns, toListRows } from "../search/query";

const MAX_MATCHES = 20;

export function lookupCode(db: AppDb, ctx: AuthCtx, raw: string): CodeLookup {
  const code = raw.trim();
  if (!code || code.length > 300) throw new ItemsError(422, "INVALID_INPUT", "code");
  const short = shortCodeFromScan(code, isShortCode);
  if (short) {
    try {
      return resolveShortCode(db, ctx, short);
    } catch (err) {
      if (!(err instanceof ItemsError && err.code === "SHORT_CODE_NOT_FOUND")) throw err;
      // A bare code may also be a barcode or ISBN-10 that happens to look like one.
      if (code.includes("/")) throw err;
    }
  }
  const isbn =
    isBooklandEan(normalizeIsbn(code)) || normalizeIsbn(code).length === 10 ? toIsbn13(code) : null;
  const values = [...new Set([code, ...(isbn ? isbnVariants(isbn) : [])])];
  const rows = db
    .select({
      ...listColumns,
      typeName: itemTypes.name,
      typeIcon: itemTypes.icon,
      locationName: locations.name,
    })
    .from(items)
    .innerJoin(itemTypes, eq(itemTypes.id, items.typeId))
    .leftJoin(locations, eq(locations.id, items.locationId))
    .where(
      and(
        or(
          inArray(items.barcode, values),
          sql`exists (select 1 from json_each(${items.attributes}) je where je.type = 'text' and je.value in ${values})`,
          sql`exists (select 1 from json_each(${items.attributes}) je, json_each(je.value) v where je.type = 'array' and v.type = 'text' and v.value in ${values})`,
        ),
        visibleItemsWhere(ctx),
      ),
    )
    .orderBy(items.nameSort, items.id)
    .limit(MAX_MATCHES)
    .all();
  return { kind: "matches", code, isbn, items: toListRows(db, ctx, rows) };
}
