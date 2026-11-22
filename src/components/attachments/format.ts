// Small display helpers for attachments.
import type { AttachmentKind } from "~/lib/attachments/rules";
import { m } from "~/paraglide/messages";
import type { Level } from "~/server/authz/levels";

const mb = new Intl.NumberFormat("de-DE", {
  style: "unit",
  unit: "megabyte",
  maximumFractionDigits: 1,
});
const kb = new Intl.NumberFormat("de-DE", {
  style: "unit",
  unit: "kilobyte",
  maximumFractionDigits: 0,
});

export function formatBytes(n: number): string {
  return n >= 1_000_000 ? mb.format(n / 1_000_000) : kb.format(Math.max(1, Math.round(n / 1000)));
}

export const KIND_LABEL: Record<AttachmentKind, () => string> = {
  photo: m.attachments_kind_photo,
  receipt: m.attachments_kind_receipt,
  manual: m.attachments_kind_manual,
  other: m.attachments_kind_other,
};

/** `edit` and `manage` may upload and change attachments. */
export const canEditAttachments = (level: Level) => level === "edit" || level === "manage";
