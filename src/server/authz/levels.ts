// Item permission levels and the resolution rules of DESIGN §3.4.
// Pure functions: no database access. The SQL twin of `itemLevel` lives in
// ./predicates.ts; a property test (predicates.property.test.ts) keeps them in sync.
import type { GrantLevel, Item, ItemGrant } from "../db/schema";
import type { AuthCtx, Role } from "./ctx";

/** `none < view < use < edit < manage` (DESIGN §3.2). */
export const LEVELS = ["none", "view", "use", "edit", "manage"] as const;
export type Level = (typeof LEVELS)[number];
/** Any level that lets the caller see the item at all. */
export type VisibleLevel = Exclude<Level, "none">;

const RANK: Record<Level, number> = { none: 0, view: 1, use: 2, edit: 3, manage: 4 };

export const levelRank = (lvl: Level): number => RANK[lvl];
export const atLeast = (lvl: Level, min: Level): boolean => RANK[lvl] >= RANK[min];
export const maxLevel = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
export const minLevel = (a: Level, b: Level): Level => (RANK[a] <= RANK[b] ? a : b);
export const isVisible = (lvl: Level): lvl is VisibleLevel => lvl !== "none";

/** Grant levels (as stored in item_grants.level) that are >= min. */
export function grantLevelsAtLeast(min: Level): GrantLevel[] {
  return LEVELS.filter((l): l is GrantLevel => l !== "none" && atLeast(l, min));
}

/** The highest level a role can ever reach on an item (DESIGN §3.4, last row). */
export const ROLE_CEILING: Record<Role, Level> = {
  admin: "manage",
  member: "manage",
  guest: "use",
};

/** The item columns the resolution rules read. Any item row (or a select of these) fits. */
export type ItemAuthFields = Pick<Item, "id" | "ownerKind" | "ownerId" | "visibility">;

/**
 * A grant as the rules need it. Pass the grants of the one item being resolved;
 * a grant that carries an `itemId` of a different item is ignored (never counted).
 */
export type GrantRef = Pick<ItemGrant, "principalKind" | "principalId" | "level"> & {
  itemId?: string;
};

/** True when ctx owns the item directly or through one of its groups. */
export function ownsItem(ctx: AuthCtx, item: Pick<Item, "ownerKind" | "ownerId">): boolean {
  if (item.ownerId == null) return false;
  return (
    (item.ownerKind === "user" && item.ownerId === ctx.userId) ||
    (item.ownerKind === "group" && ctx.groupIds.has(item.ownerId))
  );
}

/**
 * The highest level any of the grants gives ctx (directly or via a group it is
 * a member of). Not capped by the role ceiling; `itemLevel` does that.
 */
export function grantLevel(
  ctx: Pick<AuthCtx, "userId" | "groupIds">,
  grants: readonly GrantRef[],
  itemId?: string,
): Level {
  let lvl: Level = "none";
  for (const g of grants) {
    if (itemId !== undefined && g.itemId !== undefined && g.itemId !== itemId) continue;
    const applies =
      (g.principalKind === "user" && g.principalId === ctx.userId) ||
      (g.principalKind === "group" && ctx.groupIds.has(g.principalId));
    if (applies) lvl = maxLevel(lvl, g.level);
  }
  return lvl;
}

/**
 * The caller's level on one item (DESIGN §3.4, the reference code):
 * admins are always `manage`; otherwise the maximum of ownership, the member
 * household rules and the grants, then capped at the role's ceiling.
 * `grants` are that item's grants (all of them, or only the ones for ctx).
 */
export function itemLevel(ctx: AuthCtx, item: ItemAuthFields, grants: readonly GrantRef[]): Level {
  if (ctx.role === "admin") return "manage";

  let lvl: Level = "none";
  if (ownsItem(ctx, item)) lvl = "manage";
  else if (ctx.role === "member") {
    if (item.ownerKind === "household") lvl = "edit";
    else if (item.visibility === "household") lvl = "view";
  }

  lvl = maxLevel(lvl, grantLevel(ctx, grants, item.id));
  return minLevel(lvl, ROLE_CEILING[ctx.role]);
}

/** Price, currency and receipts are visible from `edit` up (DESIGN §3.2, §3.4). */
export const canSeeMoney = (lvl: Level): boolean => atLeast(lvl, "edit");

/**
 * Who may change an item's owner (DESIGN §3.6): an admin, or the item's direct
 * user owner; a group-owned item only an admin. `manage` is not enough until
 * accept-based transfers exist, or a grantee or group co-member could take the
 * item and lock the owner out. Which owners may be picked is checked separately.
 */
export function canChangeOwner(ctx: AuthCtx, item: Pick<Item, "ownerKind" | "ownerId">): boolean {
  if (ctx.role === "admin") return true;
  return ctx.role === "member" && item.ownerKind === "user" && item.ownerId === ctx.userId;
}
