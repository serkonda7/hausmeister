// Server functions for the session, used by the root route and the shell.
import { createServerFn } from "@tanstack/solid-start";
import { asc, eq } from "drizzle-orm";
import type { Role } from "../authz/ctx";
import { getDb } from "../db/client";
import { groupMembers, groups, users } from "../db/schema";
import { authMiddleware } from "./middleware";
import { getAuthCtx } from "./session";

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
