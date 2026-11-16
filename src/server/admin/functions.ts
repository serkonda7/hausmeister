// Server functions for the admin area (users, invites, groups). All are
// admin-only: roleMiddleware("admin") refuses others before the handler runs,
// and each service function checks the role again (unit-tested).
// Errors are thrown as HttpError with a code as message (e.g. "LAST_ADMIN");
// the UI maps codes to German text (src/lib/error-text.ts).
import { createServerFn } from "@tanstack/solid-start";
import { z } from "zod";
import { createInvite, INVITE_MAX_DAYS, listPendingInvites, revokeInvite } from "../auth/invites";
import { roleMiddleware } from "../auth/middleware";
import { getDb } from "../db/client";
import { ROLES } from "../db/schema";
import { getEnv } from "../env";
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  listGroups,
  removeGroupMember,
  renameGroup,
} from "./groups";
import {
  changeRole,
  listUserOptions,
  listUsers,
  resetUserPassword,
  setUserDisabled,
} from "./users";

const admin = roleMiddleware("admin");
const id = z.string().min(1).max(64);
const role = z.enum(ROLES);

// --- Users ------------------------------------------------------------------
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([admin])
  .handler(({ context: { ctx } }) => listUsers(getDb(), ctx));

export const adminChangeRole = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ userId: id, role }))
  .handler(({ context: { ctx }, data }) => changeRole(getDb(), ctx, data));

export const adminSetUserDisabled = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ userId: id, disabled: z.boolean() }))
  .handler(({ context: { ctx }, data }) => setUserDisabled(getDb(), ctx, data));

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ userId: id, password: z.string().max(200) }))
  .handler(({ context: { ctx }, data }) => resetUserPassword(getDb(), ctx, data));

export const adminListUserOptions = createServerFn({ method: "GET" })
  .middleware([admin])
  .handler(({ context: { ctx } }) => listUserOptions(getDb(), ctx));

// --- Invites ----------------------------------------------------------------
export const adminCreateInvite = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(
    z.object({ role, expiresInDays: z.number().int().min(1).max(INVITE_MAX_DAYS).optional() }),
  )
  .handler(({ context: { ctx }, data }) => createInvite(getDb(), ctx, data, getEnv().ORIGIN));

export const adminListInvites = createServerFn({ method: "GET" })
  .middleware([admin])
  .handler(({ context: { ctx } }) => listPendingInvites(getDb(), ctx));

export const adminRevokeInvite = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ inviteId: id }))
  .handler(({ context: { ctx }, data }) => revokeInvite(getDb(), ctx, data.inviteId));

// --- Groups -----------------------------------------------------------------
export const adminListGroups = createServerFn({ method: "GET" })
  .middleware([admin])
  .handler(({ context: { ctx } }) => listGroups(getDb(), ctx));

export const adminCreateGroup = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ name: z.string().max(200) }))
  .handler(({ context: { ctx }, data }) => createGroup(getDb(), ctx, data));

export const adminRenameGroup = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ groupId: id, name: z.string().max(200) }))
  .handler(({ context: { ctx }, data }) => renameGroup(getDb(), ctx, data));

export const adminDeleteGroup = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ groupId: id }))
  .handler(({ context: { ctx }, data }) => deleteGroup(getDb(), ctx, data));

export const adminAddGroupMember = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ groupId: id, userId: id }))
  .handler(({ context: { ctx }, data }) => addGroupMember(getDb(), ctx, data));

export const adminRemoveGroupMember = createServerFn({ method: "POST" })
  .middleware([admin])
  .validator(z.object({ groupId: id, userId: id }))
  .handler(({ context: { ctx }, data }) => removeGroupMember(getDb(), ctx, data));
