// Admin → users (DESIGN §3.5): list, change role, disable/enable, reset password.
// Every operation checks the admin role itself, so it is safe no matter which
// server function or route calls it. Guards: the last active admin cannot be
// demoted or disabled, and nobody can disable themselves.
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { recordEvent } from "../audit";
import { HttpError, requireRole } from "../auth/context";
import { endUserSessions, hashNewPassword, storePasswordHash } from "../auth/users";
import type { AuthCtx, Role } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import { groupMembers, groups, users } from "../db/schema";

export type AdminUserRow = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  createdAt: Date;
  /** Latest session refresh (day precision, Better Auth refreshes daily); null if none. */
  lastActiveAt: Date | null;
  groups: string[];
};

export function listUsers(db: AppDb, ctx: AuthCtx): AdminUserRow[] {
  requireRole(ctx, "admin");
  const rows = db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      disabledAt: users.disabledAt,
      createdAt: users.createdAt,
      lastActive: sql<
        number | null
      >`(SELECT max(s.updated_at) FROM sessions s WHERE s.user_id = "users"."id")`,
    })
    .from(users)
    .orderBy(asc(users.displayName))
    .all();
  const memberships = db
    .select({ userId: groupMembers.userId, name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .orderBy(asc(groups.name))
    .all();
  const byUser = new Map<string, string[]>();
  for (const m of memberships) byUser.set(m.userId, [...(byUser.get(m.userId) ?? []), m.name]);
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    role: r.role,
    disabled: r.disabledAt !== null,
    createdAt: r.createdAt,
    lastActiveAt: r.lastActive === null ? null : new Date(r.lastActive),
    groups: byUser.get(r.id) ?? [],
  }));
}

function findUser(db: DbOrTx, userId: string) {
  const u = db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      disabledAt: users.disabledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!u) throw new HttpError(404, "NOT_FOUND");
  return u;
}

function activeAdminCount(db: DbOrTx): number {
  return (
    db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), isNull(users.disabledAt)))
      .get()?.n ?? 0
  );
}

/** Would removing `target` from the active admins leave none? */
function isLastActiveAdmin(db: DbOrTx, target: { role: Role; disabledAt: Date | null }) {
  return target.role === "admin" && target.disabledAt === null && activeAdminCount(db) <= 1;
}

export function changeRole(db: AppDb, ctx: AuthCtx, input: { userId: string; role: Role }) {
  requireRole(ctx, "admin");
  db.transaction((tx) => {
    const target = findUser(tx, input.userId);
    if (target.role === input.role) return;
    if (input.role !== "admin" && isLastActiveAdmin(tx, target)) {
      throw new HttpError(409, "LAST_ADMIN");
    }
    tx.update(users).set({ role: input.role }).where(eq(users.id, target.id)).run();
    recordEvent(tx, {
      actorId: ctx.userId,
      action: "user.role_changed",
      diff: { userId: target.id, username: target.username, from: target.role, to: input.role },
    });
  });
}

export function setUserDisabled(
  db: AppDb,
  ctx: AuthCtx,
  input: { userId: string; disabled: boolean },
) {
  requireRole(ctx, "admin");
  db.transaction((tx) => {
    const target = findUser(tx, input.userId);
    if (input.disabled === (target.disabledAt !== null)) return;
    if (input.disabled) {
      if (target.id === ctx.userId) throw new HttpError(409, "SELF_DISABLE");
      if (isLastActiveAdmin(tx, target)) throw new HttpError(409, "LAST_ADMIN");
      tx.update(users).set({ disabledAt: new Date() }).where(eq(users.id, target.id)).run();
      endUserSessions(tx, target.id);
    } else {
      tx.update(users).set({ disabledAt: null }).where(eq(users.id, target.id)).run();
    }
    recordEvent(tx, {
      actorId: ctx.userId,
      action: input.disabled ? "user.disabled" : "user.enabled",
      diff: { userId: target.id, username: target.username },
    });
  });
}

/** Admin sets a new password (DESIGN §8.6); all of that user's sessions end. */
export async function resetUserPassword(
  db: AppDb,
  ctx: AuthCtx,
  input: { userId: string; password: string },
) {
  requireRole(ctx, "admin");
  findUser(db, input.userId);
  const hash = await hashNewPassword(input.password);
  db.transaction((tx) => {
    const target = findUser(tx, input.userId);
    storePasswordHash(tx, target.id, hash);
    endUserSessions(tx, target.id);
    recordEvent(tx, {
      actorId: ctx.userId,
      action: "user.password_reset",
      diff: { userId: target.id, username: target.username },
    });
  });
}

/** Users for pickers (admin → groups): active and disabled, sorted by name. */
export function listUserOptions(db: AppDb, ctx: AuthCtx) {
  requireRole(ctx, "admin");
  return db
    .select({ id: users.id, displayName: users.displayName, username: users.username })
    .from(users)
    .orderBy(asc(users.displayName))
    .all();
}
