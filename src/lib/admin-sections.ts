// Sections of the admin area (/admin). The sidebar's "Verwaltung" group and the
// admin layout show the entries a role may open (src/lib/nav.ts); each section
// route must still guard itself with `guardSection` (and its server functions
// with roleMiddleware). Add new sections here.
import { notFound } from '@tanstack/solid-router'
import type { IconName } from '~/components/ui/icons'
import { m } from '~/paraglide/messages'
import type { Role } from '~/server/authz/ctx'

export type AdminSection = {
	to: string
	label: () => string
	icon: IconName
	roles: readonly Role[]
}

const ADMIN: readonly Role[] = ['admin']

export const ADMIN_SECTIONS: readonly AdminSection[] = [
	{ to: '/admin/users', label: m.admin_nav_users, icon: 'user', roles: ADMIN },
	{ to: '/admin/invites', label: m.admin_nav_invites, icon: 'mail', roles: ADMIN },
	{ to: '/admin/groups', label: m.admin_nav_groups, icon: 'users-group', roles: ADMIN },
	{ to: '/admin/types', label: m.admin_nav_types, icon: 'category', roles: ['admin', 'member'] },
	{ to: '/admin/tags', label: m.admin_nav_tags, icon: 'tags', roles: ADMIN },
	{ to: '/admin/settings', label: m.admin_nav_settings, icon: 'settings', roles: ADMIN },
	{
		to: '/admin/export',
		label: m.admin_nav_export,
		icon: 'download',
		roles: ['admin', 'member'],
	},
]

/** Roles that may open /admin at all (guests may not). */
export const ADMIN_AREA_ROLES: readonly Role[] = ['admin', 'member']

export const sectionsFor = (role: Role) => ADMIN_SECTIONS.filter((s) => s.roles.includes(role))

/**
 * For a section route's beforeLoad: throws notFound() unless the user's role
 * may open that section. Server functions enforce the same on their own.
 *   beforeLoad: ({ context }) => guardSection(context.user.role, "/admin/users"),
 */
export function guardSection(role: Role, to: string) {
	const section = ADMIN_SECTIONS.find((s) => s.to === to)
	if (!section?.roles.includes(role)) throw notFound()
}
