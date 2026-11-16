// Who may own an item and who may receive a grant (DESIGN §2, §3.3, §3.6).
// Used by the items feature before it writes owner_kind/owner_id or item_grants.
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { groups, type Item, type ItemGrant, users } from "../db/schema";

export type OwnerInput = { ownerKind: Item["ownerKind"]; ownerId?: string | null };
export type Owner =
  | { ownerKind: "household"; ownerId: null }
  | { ownerKind: "user" | "group"; ownerId: string };

export type PrincipalInput = Pick<ItemGrant, "principalKind" | "principalId">;

export type PrincipalError =
  | "OWNER_KIND_INVALID"
  | "HOUSEHOLD_WITH_ID"
  | "ID_REQUIRED"
  | "USER_NOT_FOUND"
  | "USER_DISABLED"
  | "USER_IS_GUEST"
  | "GROUP_NOT_FOUND";

export type Checked<T> = { ok: true; value: T } | { ok: false; error: PrincipalError };

function checkUser(db: AppDb, id: string, allowGuest: boolean): PrincipalError | null {
  const u = db
    .select({ role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, id))
    .get();
  if (!u) return "USER_NOT_FOUND";
  if (u.disabledAt) return "USER_DISABLED";
  if (!allowGuest && u.role === "guest") return "USER_IS_GUEST";
  return null;
}

function checkGroup(db: AppDb, id: string): PrincipalError | null {
  const g = db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).get();
  return g ? null : "GROUP_NOT_FOUND";
}

/**
 * Validates a new owner: the household (no id), an existing active non-guest
 * user (guests don't own items), or an existing group. Returns the normalized
 * owner. Whether the caller may assign it is the items feature's rule.
 */
export function validateOwner(db: AppDb, input: OwnerInput): Checked<Owner> {
  const id = input.ownerId ?? null;
  switch (input.ownerKind) {
    case "household":
      return id === null
        ? { ok: true, value: { ownerKind: "household", ownerId: null } }
        : { ok: false, error: "HOUSEHOLD_WITH_ID" };
    case "user":
    case "group": {
      if (!id) return { ok: false, error: "ID_REQUIRED" };
      const err = input.ownerKind === "user" ? checkUser(db, id, false) : checkGroup(db, id);
      return err
        ? { ok: false, error: err }
        : { ok: true, value: { ownerKind: input.ownerKind, ownerId: id } };
    }
    default:
      return { ok: false, error: "OWNER_KIND_INVALID" };
  }
}

/**
 * Validates a grant principal: an existing active user (guests included; they
 * are what grants are for) or an existing group. A guest's effective level is
 * still capped at `use` by the role ceiling.
 */
export function validateGrantPrincipal(db: AppDb, input: PrincipalInput): Checked<PrincipalInput> {
  if (!input.principalId) return { ok: false, error: "ID_REQUIRED" };
  let err: PrincipalError | null;
  if (input.principalKind === "user") err = checkUser(db, input.principalId, true);
  else if (input.principalKind === "group") err = checkGroup(db, input.principalId);
  else err = "OWNER_KIND_INVALID";
  return err
    ? { ok: false, error: err }
    : { ok: true, value: { principalKind: input.principalKind, principalId: input.principalId } };
}
