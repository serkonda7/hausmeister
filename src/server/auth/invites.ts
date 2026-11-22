// Invites: the only way accounts are created (DESIGN §3.5, §8.6).
// An invite link carries a random token; only its SHA-256 is stored, so the
// link can be shown exactly once. Accepting claims the invite and creates the
// user in one synchronous SQLite transaction: the conditional UPDATE makes
// single use and expiry atomic, so two simultaneous accepts cannot both win.
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { recordEvent } from "../audit";
import type { AuthCtx, Role } from "../authz/ctx";
import type { AppDb } from "../db/client";
import { invites, users } from "../db/schema";
import { HttpError, requireRole } from "./context";
import { insertPreparedUser, prepareUser } from "./users";

export const INVITE_DEFAULT_DAYS = 7;
export const INVITE_MAX_DAYS = 30;
/** Bootstrap invites (first admin) are short-lived. */
export const BOOTSTRAP_INVITE_HOURS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The single error for unknown, used, expired and revoked tokens. */
export class InviteInvalidError extends Error {
  readonly code = "INVITE_INVALID";
  constructor() {
    super("INVITE_INVALID");
  }
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin}/invite/${token}`;
}

/** Inserts an invite row and returns the one-time token. No role check (internal). */
export function insertInvite(
  db: AppDb,
  opts: { role: Role; expiresAt: Date; createdBy: string | null; now?: Date },
): { id: string; token: string; expiresAt: Date } {
  const token = generateInviteToken();
  return db.transaction((tx) => {
    const row = tx
      .insert(invites)
      .values({
        role: opts.role,
        tokenHash: hashInviteToken(token),
        expiresAt: opts.expiresAt,
        createdBy: opts.createdBy,
        createdAt: opts.now ?? new Date(),
      })
      .returning({ id: invites.id })
      .get();
    recordEvent(tx, {
      actorId: opts.createdBy,
      action: "invite.created",
      diff: { inviteId: row.id, role: opts.role, expiresAt: opts.expiresAt.toISOString() },
    });
    return { id: row.id, token, expiresAt: opts.expiresAt };
  });
}

/** Admin: create an invite. Returns the link; it is never retrievable again. */
export function createInvite(
  db: AppDb,
  ctx: AuthCtx,
  input: { role: Role; expiresInDays?: number },
  origin: string,
  now = new Date(),
) {
  requireRole(ctx, "admin");
  const days = input.expiresInDays ?? INVITE_DEFAULT_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > INVITE_MAX_DAYS) {
    throw new HttpError(422, "INVITE_EXPIRY_INVALID");
  }
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  const { id, token } = insertInvite(db, {
    role: input.role,
    expiresAt,
    createdBy: ctx.userId,
    now,
  });
  return { id, role: input.role, expiresAt, url: inviteUrl(origin, token) };
}

export type PendingInvite = {
  id: string;
  role: Role;
  createdAt: Date;
  expiresAt: Date;
  createdByName: string | null;
};

/** Admin: invites that are neither used nor expired (revoked ones are deleted). */
export function listPendingInvites(db: AppDb, ctx: AuthCtx, now = new Date()): PendingInvite[] {
  requireRole(ctx, "admin");
  return db
    .select({
      id: invites.id,
      role: invites.role,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
      createdByName: users.displayName,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdBy))
    .where(and(isNull(invites.acceptedAt), gt(invites.expiresAt, now)))
    .orderBy(asc(invites.expiresAt))
    .all();
}

/** Admin: revoke a pending invite (the row is deleted; the event log keeps the history). */
export function revokeInvite(db: AppDb, ctx: AuthCtx, inviteId: string) {
  requireRole(ctx, "admin");
  db.transaction((tx) => {
    const row = tx
      .delete(invites)
      .where(and(eq(invites.id, inviteId), isNull(invites.acceptedAt)))
      .returning({ id: invites.id, role: invites.role })
      .get();
    if (!row) throw new HttpError(404, "NOT_FOUND");
    recordEvent(tx, {
      actorId: ctx.userId,
      action: "invite.revoked",
      diff: { inviteId: row.id, role: row.role },
    });
  });
}

/** Public: role of a usable invite, or null. Same answer for every kind of invalid token. */
export function inviteStatus(db: AppDb, token: string, now = new Date()): { role: Role } | null {
  if (!token || token.length > 100) return null;
  const row = db
    .select({ role: invites.role })
    .from(invites)
    .where(
      and(
        eq(invites.tokenHash, hashInviteToken(token)),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, now),
      ),
    )
    .get();
  return row ?? null;
}

export type AcceptInviteInput = {
  token: string;
  username: string;
  displayName: string;
  password: string;
};

/**
 * Public: accept an invite. Creates the user with the invite's role.
 * Throws InviteInvalidError (unknown/used/expired/revoked) or UserInputError
 * (bad username/password/display name; the invite stays usable then).
 */
export async function acceptInvite(db: AppDb, input: AcceptInviteInput, now = () => new Date()) {
  if (!inviteStatus(db, input.token, now())) throw new InviteInvalidError();
  // Role is set from the claimed row below; "guest" is only a placeholder here.
  const prepared = await prepareUser({ ...input, role: "guest" });
  const tokenHash = hashInviteToken(input.token);
  return db.transaction((tx) => {
    const at = now();
    const claimed = tx
      .update(invites)
      .set({ acceptedAt: at })
      .where(
        and(
          eq(invites.tokenHash, tokenHash),
          isNull(invites.acceptedAt),
          gt(invites.expiresAt, at),
        ),
      )
      .returning({ id: invites.id, role: invites.role })
      .get();
    if (!claimed) throw new InviteInvalidError();
    // Throws USERNAME_TAKEN, which rolls back the claim as well.
    const user = insertPreparedUser(tx, { ...prepared, role: claimed.role });
    tx.update(invites).set({ acceptedBy: user.id }).where(eq(invites.id, claimed.id)).run();
    recordEvent(tx, {
      actorId: user.id,
      action: "invite.accepted",
      diff: { inviteId: claimed.id, userId: user.id, username: user.username, role: user.role },
    });
    return user;
  });
}

/**
 * First-admin bootstrap (README "First admin"): while the instance has no
 * users at all, replace any earlier unused bootstrap invites with a fresh
 * admin invite and return its link (printed to the server log at startup).
 * Returns null once any user exists.
 */
export function ensureBootstrapInvite(db: AppDb, origin: string, now = new Date()): string | null {
  const anyUser = db.select({ id: users.id }).from(users).limit(1).get();
  if (anyUser) return null;
  // Earlier bootstrap/CLI invites (created_by NULL) can no longer be shown; drop them.
  db.delete(invites)
    .where(and(isNull(invites.createdBy), isNull(invites.acceptedAt)))
    .run();
  const { token } = insertInvite(db, {
    role: "admin",
    expiresAt: new Date(now.getTime() + BOOTSTRAP_INVITE_HOURS * 60 * 60 * 1000),
    createdBy: null,
    now,
  });
  return inviteUrl(origin, token);
}

/**
 * ensureBootstrapInvite() for process start. The dev server may run startup
 * plugins more than once per process; the same still-valid link is printed
 * again instead of replacing it.
 */
export function bootstrapInviteAtStartup(db: AppDb, origin: string): string | null {
  const g = globalThis as { __hmBootstrapLink?: string };
  const prev = g.__hmBootstrapLink;
  if (prev?.startsWith(`${origin}/invite/`)) {
    const anyUser = db.select({ id: users.id }).from(users).limit(1).get();
    if (anyUser) return null;
    if (inviteStatus(db, prev.slice(`${origin}/invite/`.length))) return prev;
  }
  const link = ensureBootstrapInvite(db, origin);
  g.__hmBootstrapLink = link ?? undefined;
  return link;
}
