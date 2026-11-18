// Server functions for ownership transfers. Rules and events: ./service.ts.
import { createServerFn } from "@tanstack/solid-start";
import { z } from "zod";
import { idSchema } from "~/lib/items/inputs";
import { startTransferInput, transferRefInput } from "~/lib/transfers/types";
import { authMiddleware } from "../auth/middleware";
import { itemsDb } from "../search/ready";
import {
  acceptTransfer,
  cancelTransfer,
  declineTransfer,
  forceTransfer,
  getItemTransfer,
  getTransferOverview,
  startTransfer,
} from "./service";

const ok = { ok: true as const };

/** TransferRow | null: the item's pending transfer (managers, starter, new owner). */
export const getItemTransferFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ itemId: idSchema }))
  .handler(({ context: { ctx }, data }) => getItemTransfer(itemsDb(), ctx, data.itemId));

/** TransferOverview: offers to me, offers I made. */
export const getTransferOverviewFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) => getTransferOverview(itemsDb(), ctx));

/** Manage. Returns { transferId }. */
export const startTransferFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(startTransferInput)
  .handler(({ context: { ctx }, data }) => startTransfer(itemsDb(), ctx, data));

export const acceptTransferFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(transferRefInput)
  .handler(({ context: { ctx }, data }) => {
    acceptTransfer(itemsDb(), ctx, data);
    return ok;
  });

export const declineTransferFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(transferRefInput)
  .handler(({ context: { ctx }, data }) => {
    declineTransfer(itemsDb(), ctx, data);
    return ok;
  });

export const cancelTransferFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(transferRefInput)
  .handler(({ context: { ctx }, data }) => {
    cancelTransfer(itemsDb(), ctx, data);
    return ok;
  });

/** Admin only (checked in the service). */
export const forceTransferFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(transferRefInput)
  .handler(({ context: { ctx }, data }) => {
    forceTransfer(itemsDb(), ctx, data);
    return ok;
  });
