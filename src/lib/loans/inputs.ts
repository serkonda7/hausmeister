// Input schemas for loans and contacts (server functions and services).
import { z } from "zod";
import { isValidIsoDate } from "../item-types/fields";
import { idSchema } from "../items/inputs";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

/** 'YYYY-MM-DD'; null clears it. */
export const dueOnSchema = z.string().refine(isValidIsoDate, "invalid date").nullable();
const quantity = z.number().finite().gt(0).max(1e9);

/** Who borrows: omitted means the caller. Guests can only borrow for themselves. */
export const borrowerInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), id: idSchema }),
  z.object({ kind: z.literal("contact"), id: idSchema }),
]);
export type BorrowerInput = z.infer<typeof borrowerInput>;

/** Use: hands the item out right away. */
export const checkoutInput = z.object({
  itemId: idSchema,
  borrower: borrowerInput.optional(),
  quantity: quantity.optional(),
  dueOn: dueOnSchema.optional(),
  note: optText(500),
});
export type CheckoutInput = z.input<typeof checkoutInput>;

/** View: asks the item's managers. */
export const requestLoanInput = z.object({
  itemId: idSchema,
  quantity: quantity.optional(),
  dueOn: dueOnSchema.optional(),
  note: optText(500),
});
export type RequestLoanInput = z.input<typeof requestLoanInput>;

export const loanRefInput = z.object({ loanId: idSchema });
export type LoanRefInput = z.infer<typeof loanRefInput>;

/** Manage. `handOver` also hands it out (status out instead of approved). */
export const approveLoanInput = z.object({
  loanId: idSchema,
  handOver: z.boolean().optional(),
  dueOn: dueOnSchema.optional(),
});
export type ApproveLoanInput = z.infer<typeof approveLoanInput>;

export const handOverLoanInput = z.object({ loanId: idSchema, dueOn: dueOnSchema.optional() });
export const setLoanDueInput = z.object({ loanId: idSchema, dueOn: dueOnSchema });

// --- Contacts -------------------------------------------------------------------
export const contactInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "invalid email")
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
  phone: optText(50),
  notes: optText(1000),
});
export type ContactInput = z.input<typeof contactInput>;
export const updateContactInput = contactInput.extend({ id: idSchema });
export type UpdateContactInput = z.input<typeof updateContactInput>;
