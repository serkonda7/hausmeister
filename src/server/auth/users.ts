// Server-side account management shared by the invite flow and admin pages.
// These never go through Better Auth's HTTP endpoints (public sign-up is off).
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { AuthCtx, Role } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import { accounts, groupMembers, sessions, type User, users } from "../db/schema";
import { reindexItemsReferencingUser } from "../search/indexer";
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

/** Validated input with the password already hashed; insert with insertPreparedUser(). */
export type PreparedUser = {
  username: string;
  displayUsername: string;
  displayName: string;
  role: Role;
  email: string | null;
  locale: string;
  passwordHash: string;
};

export const DISPLAY_NAME_MAX_LENGTH = 60;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Validates a display name; returns the trimmed value. */
export function validateDisplayName(displayName: string): string {
  const v = displayName.trim();
  if (!v || v.length > DISPLAY_NAME_MAX_LENGTH) throw new UserInputError("DISPLAY_NAME_REQUIRED");
  return v;
}

export function validatePassword(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) throw new UserInputError("PASSWORD_TOO_SHORT");
  if (password.length > PASSWORD_MAX_LENGTH) throw new UserInputError("PASSWORD_TOO_LONG");
}

/** Validates input and hashes the password (the slow, async part). No DB access. */
export async function prepareUser(input: CreateUserInput): Promise<PreparedUser> {
  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) throw new UserInputError("USERNAME_INVALID");
  const displayName = validateDisplayName(input.displayName);
  validatePassword(input.password);
  return {
    username,
    displayUsername: input.username.trim(),
    displayName,
    role: input.role,
    email: input.email?.trim() || null,
    locale: input.locale ?? "de-DE",
    passwordHash: await hashPassword(input.password),
  };
}

/**
 * Inserts a prepared user plus its password credential. Synchronous, so it
 * can run inside a caller's transaction (the invite flow claims the invite in
 * the same transaction). Throws UserInputError("USERNAME_TAKEN").
 */
export function insertPreparedUser(tx: DbOrTx, p: PreparedUser): User {
  const taken = tx.select({ id: users.id }).from(users).where(eq(users.username, p.username)).get();
  if (taken) throw new UserInputError("USERNAME_TAKEN");
  const id = Bun.randomUUIDv7();
  const user = tx
    .insert(users)
    .values({
      id,
      username: p.username,
      displayUsername: p.displayUsername,
      displayName: p.displayName,
      // Better Auth requires a unique email; this synthetic one is never shown or mailed.
      authEmail: `${id}@users.invalid`,
      email: p.email,
      role: p.role,
      locale: p.locale,
    })
    .returning()
    .get();
  tx.insert(accounts)
    .values({ userId: id, accountId: id, providerId: "credential", password: p.passwordHash })
    .run();
  return user;
}

/**
 * Creates a user with a password credential that Better Auth's
 * `/sign-in/username` accepts. Usernames are stored lowercase.
 * Throws UserInputError for invalid input.
 */
export async function createUserWithPassword(db: AppDb, input: CreateUserInput): Promise<User> {
  const prepared = await prepareUser(input);
  return db.transaction((tx) => insertPreparedUser(tx, prepared));
}

/** Validates and hashes a new password (async part of a password change). */
export async function hashNewPassword(password: string): Promise<string> {
  validatePassword(password);
  return hashPassword(password);
}

/** Stores a password hash as the user's credential (creates it if missing). */
export function storePasswordHash(db: DbOrTx, userId: string, hash: string) {
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

/** Replaces the password credential (admin reset, DESIGN §8.6). */
export async function setUserPassword(db: DbOrTx, userId: string, password: string) {
  storePasswordHash(db, userId, await hashNewPassword(password));
}

/** Ends every session of a user (they must sign in again). */
export function endUserSessions(db: DbOrTx, userId: string) {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

/** Disables a user and ends all of their sessions. */
export function disableUser(db: AppDb, userId: string) {
  db.transaction((tx) => {
    tx.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
  });
}

/**
 * Changes a user's display name and reindexes the items that reference the
 * user in a `user` field (the search index holds the name, not the id).
 */
export function updateDisplayName(db: AppDb, userId: string, raw: string): string {
  const displayName = validateDisplayName(raw);
  db.transaction((tx) => {
    tx.update(users).set({ displayName }).where(eq(users.id, userId)).run();
    reindexItemsReferencingUser(tx, userId);
  });
  return displayName;
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
