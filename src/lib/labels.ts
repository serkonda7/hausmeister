// German labels for enum values. Keys stay English; text comes from the catalog.
import { m } from "~/paraglide/messages";
import type { Role } from "~/server/authz/ctx";

export const roleLabel = (role: Role): string =>
  ({ admin: m.role_admin, member: m.role_member, guest: m.role_guest })[role]();
