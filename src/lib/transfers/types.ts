// Inputs and shapes of ownership transfers (DESIGN §3.6).
import { z } from "zod";
import { idSchema } from "../items/inputs";
import type { OwnerRef } from "../items/types";

export const startTransferInput = z.object({
  itemId: idSchema,
  to: z.object({ ownerKind: z.enum(["user", "group"]), ownerId: idSchema }),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v)),
});
export type StartTransferInput = z.input<typeof startTransferInput>;
export const transferRefInput = z.object({ transferId: idSchema });

export type TransferActions = {
  accept: boolean;
  decline: boolean;
  cancel: boolean;
  force: boolean;
};

export type TransferRow = {
  id: string;
  itemId: string;
  from: OwnerRef;
  to: OwnerRef;
  note: string | null;
  createdBy: { id: string; name: string } | null;
  createdAt: Date;
  /** The caller is (one of) the new owner(s). */
  toMe: boolean;
  actions: TransferActions;
};

export type TransferListRow = TransferRow & {
  item: { id: string; name: string; typeIcon: string | null; visible: boolean };
};

export type TransferOverview = {
  /** Pending offers to the caller or one of their groups. */
  incoming: TransferListRow[];
  /** Pending offers the caller made. */
  outgoing: TransferListRow[];
};
