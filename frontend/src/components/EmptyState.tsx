import type { JSX } from 'solid-js'

export default function EmptyState(props: { children: JSX.Element }): JSX.Element {
	return <p class="muted text-sm">{props.children}</p>
}
