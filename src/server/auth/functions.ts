// Server functions for the session, used by the root route and the shell.
import { createServerFn } from "@tanstack/solid-start";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Role } from "../authz/ctx";
import { getDb } from "../db/client";
import { groupMembers, groups, passkeys, users } from "../db/schema";
import { authMiddleware } from "./middleware";
import { getAuthCtx } from "./session";
import { updateDisplayName } from "./users";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

/** The signed-in, active user, or null. Safe to call when signed out. */
export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    const ctx = await getAuthCtx();
    if (!ctx) return null;
    const u = getDb()
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .get();
    return u ?? null;
  },
);

/** Example of the standard pattern: authMiddleware provides `context.ctx`. */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) => {
    const db = getDb();
    const groupNames = db
      .select({ name: groups.name })
      .from(groups)
      .innerJoin(groupMembers, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, ctx.userId))
      .orderBy(asc(groups.name))
      .all()
      .map((g) => g.name);
    return { role: ctx.role, groups: groupNames };
  });

/** Account page: change the caller's own display name. */
export const updateMyDisplayName = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ displayName: z.string().max(200) }))
  .handler(({ context: { ctx }, data }) => ({
    displayName: updateDisplayName(getDb(), ctx.userId, data.displayName),
  }));

/** Account page: the caller's passkeys (no key material). */
export const listMyPasskeys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context: { ctx } }) =>
    getDb()
      .select({
        id: passkeys.id,
        name: passkeys.name,
        createdAt: passkeys.createdAt,
        deviceType: passkeys.deviceType,
      })
      .from(passkeys)
      .where(eq(passkeys.userId, ctx.userId))
      .orderBy(desc(passkeys.createdAt))
      .all(),
  );
