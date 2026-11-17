// Event log writer for app-level (non-item) actions: invites, users, groups.
// Rows go to `events` with item_id NULL. A diff must never carry secrets
// (passwords, tokens, hashes); recordEvent refuses such keys so a mistake
// fails loudly in tests instead of leaking into the log.
import type { DbOrTx } from "./db/client";
import { events } from "./db/schema";

export type AuditAction =
  | "invite.created"
  | "invite.revoked"
  | "invite.accepted"
  | "user.role_changed"
  | "user.disabled"
  | "user.enabled"
  | "user.password_reset"
  | "group.created"
  | "group.renamed"
  | "group.deleted"
  | "group.member_added"
  | "group.member_removed"
  | "settings.updated"
  // src/server/export (diff: { scope, completed, bytes, counts, reason? }).
  | "export.created"
  // Item events from src/server/attachments (diff: { attachmentId, kind, originalName }).
  | "attachment.added"
  | "attachment.removed";

/** Keys that look like secrets. Matched case-insensitively at any depth. */
const SECRET_KEY = /pass(word)?|token|hash|secret|credential/i;

export function findSecretKey(value: unknown, path = ""): string | null {
  if (value === null || typeof value !== "object") return null;
  for (const [k, v] of Object.entries(value)) {
    const p = path ? `${path}.${k}` : k;
    if (SECRET_KEY.test(k)) return p;
    const nested = findSecretKey(v, p);
    if (nested) return nested;
  }
  return null;
}

export function recordEvent(
  db: DbOrTx,
  e: {
    actorId: string | null;
    action: AuditAction;
    diff?: Record<string, unknown>;
    itemId?: string | null;
  },
) {
  const bad = findSecretKey(e.diff);
  if (bad) throw new Error(`Refusing to log secret-looking key "${bad}" in ${e.action}`);
  db.insert(events)
    .values({ itemId: e.itemId ?? null, actorId: e.actorId, action: e.action, diff: e.diff ?? {} })
    .run();
}
