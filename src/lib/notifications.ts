// Notification kinds, their shapes and German text (shared by the inbox page and the server).
// The payload of each kind:
//   stock.low           { quantity, minQuantity, unit }
//   loan.requested      { actorName, quantity, dueOn }      to the item's managers
//   loan.approved       { actorName, dueOn }                to the borrower
//   loan.declined       { actorName }                       to the borrower
//   transfer.requested  { actorName, itemName }             to the new owner(s)
//   transfer.started    { actorName, toName }               to the owner, when someone else started it
//   transfer.accepted   { actorName }                       to whoever started it
//   transfer.declined   { actorName }                       to whoever started it
//   transfer.cancelled  { actorName }                       to the new owner(s)
import { m } from "~/paraglide/messages";
import { formatDate, formatNumber } from "./format";
import type { JsonObject } from "./items/types";

export const NOTIFICATION_KINDS = [
  "stock.low",
  "loan.requested",
  "loan.approved",
  "loan.declined",
  "transfer.requested",
  "transfer.started",
  "transfer.accepted",
  "transfer.declined",
  "transfer.cancelled",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationEntry = {
  id: string;
  kind: NotificationKind;
  at: Date;
  read: boolean;
  /** Null when the item is gone or the reader can no longer see it. */
  item: { id: string; name: string; shortCode: string | null } | null;
  payload: JsonObject;
};

export type NotificationPage = {
  entries: NotificationEntry[];
  nextCursor: string | null;
  unread: number;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const day = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(`${v}T12:00:00Z`) : "";

/** One German sentence for the inbox. `itemName` falls back to the payload's, then a placeholder. */
export function notificationText(n: Pick<NotificationEntry, "kind" | "item" | "payload">): string {
  const p = n.payload;
  const name = n.item?.name ?? (str(p.itemName) || m.notifications_item_hidden());
  const actor = str(p.actorName) || m.history_unknown_actor();
  switch (n.kind) {
    case "stock.low":
      return m.notifications_stock_low({
        name,
        quantity: `${formatNumber(Number(p.quantity ?? 0), 3)}${p.unit ? ` ${str(p.unit)}` : ""}`,
        min: formatNumber(Number(p.minQuantity ?? 0), 3),
      });
    case "loan.requested":
      return p.dueOn
        ? m.notifications_loan_requested_due({ actor, name, due: day(p.dueOn) })
        : m.notifications_loan_requested({ actor, name });
    case "loan.approved":
      return p.dueOn
        ? m.notifications_loan_approved_due({ actor, name, due: day(p.dueOn) })
        : m.notifications_loan_approved({ actor, name });
    case "loan.declined":
      return m.notifications_loan_declined({ actor, name });
    case "transfer.requested":
      return m.notifications_transfer_requested({ actor, name });
    case "transfer.started":
      return m.notifications_transfer_started({ actor, name, to: str(p.toName) });
    case "transfer.accepted":
      return m.notifications_transfer_accepted({ actor, name });
    case "transfer.declined":
      return m.notifications_transfer_declined({ actor, name });
    case "transfer.cancelled":
      return m.notifications_transfer_cancelled({ actor, name });
    default:
      return name;
  }
}
