// Sections of the admin area (/admin). The layout shows the entries a role may
// open; each section route must still guard itself with `requireSectionRole`
// (and its server functions with roleMiddleware). Add new sections here.
import { notFound } from "@tanstack/solid-router";
import { m } from "~/paraglide/messages";
import type { Role } from "~/server/authz/ctx";

export type AdminSection = { to: string; label: () => string; roles: readonly Role[] };

const ADMIN: readonly Role[] = ["admin"];

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { to: "/admin/users", label: m.admin_nav_users, roles: ADMIN },
  { to: "/admin/invites", label: m.admin_nav_invites, roles: ADMIN },
  { to: "/admin/groups", label: m.admin_nav_groups, roles: ADMIN },
  { to: "/admin/types", label: m.admin_nav_types, roles: ["admin", "member"] },
  { to: "/admin/tags", label: m.admin_nav_tags, roles: ADMIN },
  { to: "/admin/settings", label: m.admin_nav_settings, roles: ADMIN },
  { to: "/admin/export", label: m.admin_nav_export, roles: ADMIN },
];

/** Roles that may open /admin at all (guests may not). */
export const ADMIN_AREA_ROLES: readonly Role[] = ["admin", "member"];

export const sectionsFor = (role: Role) => ADMIN_SECTIONS.filter((s) => s.roles.includes(role));

/**
 * For a section route's beforeLoad: throws notFound() unless the user's role
 * may open that section. Server functions enforce the same on their own.
 *   beforeLoad: ({ context }) => guardSection(context.user.role, "/admin/users"),
 */
export function guardSection(role: Role, to: string) {
  const section = ADMIN_SECTIONS.find((s) => s.to === to);
  if (!section?.roles.includes(role)) throw notFound();
}
