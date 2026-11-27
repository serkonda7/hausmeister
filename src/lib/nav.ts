// Main navigation (src/components/app-shell.tsx): the sidebar on wide screens
// and the menu drawer on phones show these groups; the phone's bottom bar
// shows TAB_BAR. Entries hide for roles not listed (pages guard themselves).
import type { IconName } from '~/components/ui/icons'
import { m } from '~/paraglide/messages'
import type { Role } from '~/server/authz/ctx'
import { ADMIN_SECTIONS } from './admin-sections'

export type NavEntry = {
	to: string
	label: () => string
	icon: IconName
	roles?: readonly Role[]
	/** Quick-add shortcut shown next to the entry. */
	add?: { to: string; label: () => string; roles: readonly Role[] }
}

export type NavGroup = { id: string; label: () => string; entries: readonly NavEntry[] }

const WRITERS: readonly Role[] = ['admin', 'member']

export const NAV_HOME: NavEntry = { to: '/', label: m.nav_home, icon: 'home' }

const ITEMS: NavEntry = {
	to: '/items',
	label: m.nav_items,
	icon: 'package',
	add: { to: '/items/new', label: m.nav_add_item, roles: WRITERS },
}
const LOCATIONS: NavEntry = { to: '/locations', label: m.nav_locations, icon: 'map-pin' }
const SCAN: NavEntry = { to: '/scan', label: m.nav_scan, icon: 'scan' }

export const NAV_GROUPS: readonly NavGroup[] = [
	{
		id: 'inventory',
		label: m.nav_group_inventory,
		entries: [
			ITEMS,
			LOCATIONS,
			SCAN,
			{ to: '/labels', label: m.nav_labels, icon: 'qrcode', roles: WRITERS },
		],
	},
	{
		id: 'lending',
		label: m.nav_group_lending,
		entries: [
			{ to: '/loans', label: m.nav_loans, icon: 'arrows-exchange' },
			{ to: '/contacts', label: m.contacts_title, icon: 'address-book', roles: WRITERS },
		],
	},
	{
		id: 'admin',
		label: m.admin_nav_title,
		entries: ADMIN_SECTIONS.map((s) => ({
			to: s.to,
			label: s.label,
			icon: s.icon,
			roles: s.roles,
		})),
	},
]

/** Bottom bar on phones (the last cell, "Menü", opens the drawer). */
export const TAB_BAR: readonly NavEntry[] = [NAV_HOME, ITEMS, SCAN, LOCATIONS]

const allowed = (e: { roles?: readonly Role[] }, role: Role) => !e.roles || e.roles.includes(role)

/** The groups and entries `role` may open; empty groups are dropped. */
export function navFor(role: Role): NavGroup[] {
	return NAV_GROUPS.map((g) => ({
		...g,
		entries: g.entries.filter((e) => allowed(e, role)),
	})).filter((g) => g.entries.length > 0)
}

export const canAdd = (e: NavEntry, role: Role) => !!e.add && allowed(e.add, role)

/** Whether `pathname` is the entry's page or below it ("/" only matches itself). */
export function isActivePath(pathname: string, to: string): boolean {
	if (to === '/') return pathname === '/'
	return pathname === to || pathname.startsWith(`${to}/`)
}
