// Server-side account management shared by the invite flow and admin pages.
// These never go through Better Auth's HTTP endpoints (public sign-up is off).
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthCtx, Role } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { accounts, groupMembers, sessions, type User, users } from "../db/schema";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, USERNAME_PATTERN } from "./auth";

export class UserInputError extends Error {
  constructor(
    public readonly code:
      | "USERNAME_INVALID"
      | "USERNAME_TAKEN"
      | "PASSWORD_TOO_SHORT"
      | "PASSWORD_TOO_LONG"
      | "DISPLAY_NAME_REQUIRED",
  ) {
    super(code);
  }
}

export type CreateUserInput = {
  username: string;
  password: string;
  displayName: string;
  role: Role;
  email?: string | null;
  locale?: string;
};

/**
 * Creates a user with a password credential that Better Auth's
 * `/sign-in/username` accepts. Usernames are stored lowercase.
 * Throws UserInputError for invalid input.
 */
export async function createUserWithPassword(db: AppDb, input: CreateUserInput): Promise<User> {
  const username = input.username.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!USERNAME_PATTERN.test(username)) throw new UserInputError("USERNAME_INVALID");
  if (!displayName) throw new UserInputError("DISPLAY_NAME_REQUIRED");
  if (input.password.length < PASSWORD_MIN_LENGTH) throw new UserInputError("PASSWORD_TOO_SHORT");
  if (input.password.length > PASSWORD_MAX_LENGTH) throw new UserInputError("PASSWORD_TOO_LONG");
  const taken = db.select({ id: users.id }).from(users).where(eq(users.username, username)).get();
  if (taken) throw new UserInputError("USERNAME_TAKEN");

  const hash = await hashPassword(input.password);
  const id = Bun.randomUUIDv7();
  return db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({
        id,
        username,
        displayUsername: input.username.trim(),
        displayName,
        // Better Auth requires a unique email; this synthetic one is never shown or mailed.
        authEmail: `${id}@users.invalid`,
        email: input.email?.trim() || null,
        role: input.role,
        locale: input.locale ?? "de-DE",
      })
      .returning()
      .get();
    tx.insert(accounts)
      .values({ userId: id, accountId: id, providerId: "credential", password: hash })
      .run();
    return user;
  });
}

/** Replaces the password credential (admin reset, DESIGN §8.6). */
export async function setUserPassword(db: AppDb, userId: string, password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) throw new UserInputError("PASSWORD_TOO_SHORT");
  if (password.length > PASSWORD_MAX_LENGTH) throw new UserInputError("PASSWORD_TOO_LONG");
  const hash = await hashPassword(password);
  const existing = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .get();
  if (existing) {
    db.update(accounts).set({ password: hash }).where(eq(accounts.id, existing.id)).run();
  } else {
    db.insert(accounts)
      .values({ userId, accountId: userId, providerId: "credential", password: hash })
      .run();
  }
}

/** Disables a user and ends all of their sessions. */
export function disableUser(db: AppDb, userId: string) {
  db.transaction((tx) => {
    tx.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
  });
}

export function enableUser(db: AppDb, userId: string) {
  db.update(users).set({ disabledAt: null }).where(eq(users.id, userId)).run();
}

/**
 * Loads role and group memberships for an active user.
 * Returns null for unknown or disabled users.
 */
export function loadAuthCtx(db: AppDb, userId: string): AuthCtx | null {
  const user = db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.disabledAt)))
    .get();
  if (!user) return null;
  const rows = db
    .select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .where(eq(groupMembers.userId, userId))
    .all();
  return { userId: user.id, role: user.role, groupIds: new Set(rows.map((r) => r.groupId)) };
}
