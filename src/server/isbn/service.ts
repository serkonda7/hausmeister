// ISBN auto-fill for quick add and shelf mode (DESIGN §5.2).
// Admins and members only (the ones who add items), rate-limited per user so a stuck scanner cannot hammer the libraries.
// ISBN_LOOKUP=off (env) turns the outbound calls off: every lookup is then "unavailable" and people type the data in.
// The sources and their order come from the type's `isbn` field (`lookup`); without a type, DNB then Open Library.
import { z } from "zod";
import { toIsbn13 } from "../../lib/isbn";
import type { BookLookupResult } from "../../lib/isbn-types";
import { activeFields, type FieldDefinition, type IsbnLookup } from "../../lib/item-types/fields";
import { idSchema } from "../../lib/items/inputs";
import type { JsonObject } from "../../lib/items/types";
import { HttpError } from "../auth/context";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { getEnv } from "../env";
import { createRateLimiter } from "../http/rate-limit";
import { effectiveFieldsForType } from "../item-types/service";
import { forbidden, ItemsError, parseInput } from "../items/errors";
import { lookupIsbn } from "./lookup";
import { bookAttributes } from "./map";

export const DEFAULT_SOURCES: readonly IsbnLookup[] = ["dnb", "openlibrary"];

export const lookupBookInput = z.object({
  isbn: z.string().min(10).max(20),
  typeId: idSchema.optional(),
});

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

type IsbnField = Extract<FieldDefinition, { kind: "isbn" }>;

/** The type's first active ISBN field (its lookup list says which sources to ask). */
export function isbnFieldOf(fields: readonly FieldDefinition[]): IsbnField | undefined {
  return activeFields(fields).find((f): f is IsbnField => f.kind === "isbn");
}

export async function lookupBook(
  db: AppDb,
  ctx: AuthCtx,
  raw: { isbn: string; typeId?: string },
  opts: { fetch?: NonNullable<Parameters<typeof lookupIsbn>[2]>["fetch"] } = {},
): Promise<BookLookupResult> {
  if (ctx.role === "guest") throw forbidden();
  const input = parseInput(lookupBookInput, raw);
  const isbn = toIsbn13(input.isbn);
  if (!isbn) throw new ItemsError(422, "ISBN_INVALID");
  const fields = input.typeId ? effectiveFieldsForType(db, input.typeId) : [];
  const field = isbnFieldOf(fields);
  const sources = field?.lookup?.length ? field.lookup : DEFAULT_SOURCES;
  if (!limiter.hit(ctx.userId)) throw new HttpError(429, "RATE_LIMITED");
  if (!opts.fetch && getEnv().ISBN_LOOKUP === "off") return { status: "unavailable", isbn };
  const r = await lookupIsbn(isbn, sources, { fetch: opts.fetch });
  if (r.status !== "found") return { status: r.status, isbn };
  return {
    status: "found",
    book: r.book,
    name: r.book.title,
    attributes: bookAttributes(fields, r.book) as JsonObject,
  };
}

export function resetIsbnRateLimit() {
  limiter.reset();
}
