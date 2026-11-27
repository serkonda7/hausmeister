// Owner choice for the item form and the "change owner" action. Members may
// pick the household, themselves and their own groups; admins any active
// non-guest user and any group (the server checks again: OWNER_NOT_ALLOWED).
import { useQuery } from '@tanstack/solid-query'
import { createMemo, For } from 'solid-js'
import { inputClass } from '~/components/ui/input'
import { principalsQuery } from '~/lib/items/queries'
import type { OwnerKind } from '~/lib/items/types'
import { m } from '~/paraglide/messages'
import type { SessionUser } from '~/server/auth/functions'

export type OwnerValue = { ownerKind: OwnerKind; ownerId: string | null }

export const ownerValueToken = (v: OwnerValue) =>
	v.ownerKind === 'household' ? 'household' : `${v.ownerKind}:${v.ownerId}`

export function tokenToOwner(t: string): OwnerValue {
	if (t === 'household' || !t.includes(':')) return { ownerKind: 'household', ownerId: null }
	const [kind, id] = [t.slice(0, t.indexOf(':')), t.slice(t.indexOf(':') + 1)]
	return { ownerKind: kind === 'group' ? 'group' : 'user', ownerId: id }
}

export function OwnerSelect(props: {
	id: string
	user: SessionUser
	value: OwnerValue
	onChange: (v: OwnerValue) => void
	/** Name of the current owner, kept selectable even if no longer offered. */
	currentName?: string
	describedBy?: string
	disabled?: boolean
}) {
	const q = useQuery(() => principalsQuery())
	const options = createMemo(() => {
		const isAdmin = props.user.role === 'admin'
		const out: { token: string; label: string }[] = [
			{ token: 'household', label: m.items_owner_household() },
		]
		const users = (q.data?.users ?? []).filter(
			(u) => u.role !== 'guest' && (isAdmin || u.id === props.user.id),
		)
		if (!users.some((u) => u.id === props.user.id))
			users.unshift({
				id: props.user.id,
				displayName: props.user.displayName,
				role: 'member',
			})
		for (const u of users)
			out.push({
				token: `user:${u.id}`,
				label:
					u.id === props.user.id
						? m.item_owner_me({ name: u.displayName })
						: u.displayName,
			})
		for (const g of q.data?.groups ?? [])
			if (isAdmin || g.member)
				out.push({ token: `group:${g.id}`, label: m.item_owner_group({ name: g.name }) })
		const cur = ownerValueToken(props.value)
		if (!out.some((o) => o.token === cur))
			out.push({ token: cur, label: props.currentName ?? m.items_owner_unknown() })
		return out
	})
	return (
		<select
			id={props.id}
			class={inputClass}
			value={ownerValueToken(props.value)}
			aria-describedby={props.describedBy}
			disabled={props.disabled}
			onChange={(e) => props.onChange(tokenToOwner(e.currentTarget.value))}
		>
			<For each={options()}>
				{(o) => (
					<option value={o.token} selected={o.token === ownerValueToken(props.value)}>
						{o.label}
					</option>
				)}
			</For>
		</select>
	)
}
