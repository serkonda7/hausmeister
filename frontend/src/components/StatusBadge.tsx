import type { JSX } from 'solid-js'

interface StatusBadgeProps {
	/** `true` → `status-badge--ok`, `false` → `status-badge--warn`. */
	ok: boolean
	class?: string
	children: JSX.Element
}

/**
 * Shared status pill: icon + text, never color-only (color-blind safe).
 * Pass `class="pool-status"` at the Dashboard pool-tags call site to keep
 * the `margin-left: auto` alignment there.
 */
export default function StatusBadge(props: StatusBadgeProps): JSX.Element {
	return (
		<span
			class={`status-badge${props.class ? ` ${props.class}` : ''}`}
			classList={{
				'status-badge--ok': props.ok,
				'status-badge--warn': !props.ok,
			}}
		>
			{props.children}
		</span>
	)
}
