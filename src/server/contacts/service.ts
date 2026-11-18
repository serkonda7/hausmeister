// External contacts (DESIGN §5.3): people without an account who borrow
// things, e.g. the neighbour. Admins and members list and edit them; guests
// never see them (only a loan's borrower name on items they can see).
// A contact with open loans cannot be deleted; closed loans keep their
// history (events carry the name) and lose the link.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  type ContactInput,
  contactInput,
  type UpdateContactInput,
  updateContactInput,
} from "../../lib/loans/inputs";
import type { ContactRow } from "../../lib/loans/types";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { contacts, loans } from "../db/schema";
import { forbidden, ItemsError, parseInput } from "../items/errors";

function assertMayUse(ctx: AuthCtx) {
  if (ctx.role === "guest") throw forbidden();
}

export function listContacts(db: AppDb, ctx: AuthCtx): ContactRow[] {
  assertMayUse(ctx);
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      phone: contacts.phone,
      notes: contacts.notes,
      openLoans: sql<number>`count(${loans.id})`,
    })
    .from(contacts)
    .leftJoin(
      loans,
      and(
        eq(loans.borrowerContactId, contacts.id),
        inArray(loans.status, ["requested", "approved", "out"]),
      ),
    )
    .groupBy(contacts.id)
    .orderBy(asc(sql`lower(${contacts.name})`), asc(contacts.id))
    .all();
}

export function createContact(db: AppDb, ctx: AuthCtx, raw: ContactInput): { id: string } {
  assertMayUse(ctx);
  const input = parseInput(contactInput, raw);
  const row = db
    .insert(contacts)
    .values({
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.userId,
    })
    .returning({ id: contacts.id })
    .get();
  return row;
}

export function updateContact(db: AppDb, ctx: AuthCtx, raw: UpdateContactInput) {
  assertMayUse(ctx);
  const input = parseInput(updateContactInput, raw);
  const r = db
    .update(contacts)
    .set({
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    })
    .where(eq(contacts.id, input.id))
    .run() as unknown as { changes: number };
  if (r.changes !== 1) throw new ItemsError(404, "CONTACT_NOT_FOUND");
}

export function deleteContact(db: AppDb, ctx: AuthCtx, id: string) {
  assertMayUse(ctx);
  db.transaction((tx) => {
    const c = tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, id)).get();
    if (!c) throw new ItemsError(404, "CONTACT_NOT_FOUND");
    const open = tx
      .select({ id: loans.id })
      .from(loans)
      .where(
        and(
          eq(loans.borrowerContactId, id),
          inArray(loans.status, ["requested", "approved", "out"]),
        ),
      )
      .get();
    if (open) throw new ItemsError(409, "CONTACT_IN_USE");
    tx.delete(contacts).where(eq(contacts.id, id)).run();
  });
}
