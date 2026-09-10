import type { JSX } from 'solid-js'
import { Show } from 'solid-js'

interface PageHeaderProps {
	title: string
	subtitle?: string
	actions?: JSX.Element
	style?: JSX.CSSProperties
}

/**
 * Shared page header: `<div class="page-header">` + title (+ optional
 * subtitle) + caller-provided actions (single button or an
 * `<div class="inline-row">` group).
 */
export default function PageHeader(props: PageHeaderProps): JSX.Element {
	return (
		<div class="page-header" style={props.style}>
			<div>
				<h2 class="page-title">{props.title}</h2>
				<Show when={props.subtitle}>
					<p class="page-subtitle">{props.subtitle}</p>
				</Show>
			</div>
			<Show when={props.actions}>{props.actions}</Show>
		</div>
	)
}
