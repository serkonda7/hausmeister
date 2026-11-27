// Who can be picked as an item's owner or as a grantee (owner and share
// pickers on the item pages). Admins and members only: guests never manage
// items. Whether a pick is allowed is still checked by the item service
// (assertOwnerAllowed, validateGrantPrincipal); this only lists candidates.
import { asc, eq, isNull } from 'drizzle-orm'
import type { AuthCtx, Role } from '../authz/ctx'
import type { AppDb } from '../db/client'
import { groupMembers, groups, users } from '../db/schema'
import { ItemsError } from './errors'

export type PrincipalOptions = {
	/** Active users (guests included: they can receive grants), by display name. */
	users: { id: string; displayName: string; role: Role }[]
	/** All groups; `member` when the caller belongs to it. */
	groups: { id: string; name: string; member: boolean }[]
}

export function listPrincipals(db: AppDb, ctx: AuthCtx): PrincipalOptions {
	if (ctx.role === 'guest') throw new ItemsError(403, 'ITEM_FORBIDDEN')
	const userRows = db
		.select({ id: users.id, displayName: users.displayName, role: users.role })
		.from(users)
		.where(isNull(users.disabledAt))
		.orderBy(asc(users.displayName))
		.all()
	const mine = new Set(
		db
			.select({ id: groupMembers.groupId })
			.from(groupMembers)
			.where(eq(groupMembers.userId, ctx.userId))
			.all()
			.map((r) => r.id),
	)
	const groupRows = db
		.select({ id: groups.id, name: groups.name })
		.from(groups)
		.orderBy(asc(groups.name))
		.all()
		.map((g) => ({ ...g, member: mine.has(g.id) }))
	return { users: userRows, groups: groupRows }
}
