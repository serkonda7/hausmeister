// German labels for loans.
import { m } from "~/paraglide/messages";
import { formatIsoDay, formatNumber } from "../format";
import type { LoanRow, LoanStatus } from "./types";

export const loanStatusLabel = (s: LoanStatus): string =>
  ({
    requested: m.loans_status_requested,
    approved: m.loans_status_approved,
    out: m.loans_status_out,
    returned: m.loans_status_returned,
    declined: m.loans_status_declined,
    cancelled: m.loans_status_cancelled,
  })[s]();

/** "Anna · bis 21.11.2026" / "Nachbar Tom · 3 Stück · überfällig seit 01.11.2026". */
export function loanSummary(l: LoanRow, opts: { unit?: string | null; stock?: boolean } = {}) {
  const parts = [l.borrower.name];
  if (opts.stock) parts.push(`${formatNumber(l.quantity, 3)}${opts.unit ? ` ${opts.unit}` : ""}`);
  if (l.dueOn)
    parts.push(
      l.overdue
        ? m.loans_overdue_since({ date: formatIsoDay(l.dueOn) })
        : m.loans_due({ date: formatIsoDay(l.dueOn) }),
    );
  return parts.join(" · ");
}
