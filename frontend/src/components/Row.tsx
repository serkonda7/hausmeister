import { type JSX, Show } from 'solid-js'

interface RowProps {
	title: JSX.Element
	sub?: JSX.Element
	right?: JSX.Element
}

/**
 * Shared `row-between` section row: left title + sub, right-aligned slot.
 * Unifies the Dashboard cashflow / unlocks sections, which differed only
 * in the right-side formatting.
 */
export default function Row(props: RowProps): JSX.Element {
	return (
		<div class="row-between">
			<div>
				<div class="row-title">{props.title}</div>
				<Show when={props.sub != null}>
					<div class="pool-sub">{props.sub}</div>
				</Show>
			</div>
			{props.right}
		</div>
	)
}
