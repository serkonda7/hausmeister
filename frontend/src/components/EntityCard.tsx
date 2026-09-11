import { type JSX, Show } from 'solid-js'
import CrudRow from './CrudRow'

interface EntityCardProps {
	title: JSX.Element
	meta?: JSX.Element
	/** Right-side amount slot (usually `<Amount>`). Omit for rows without one. */
	amount?: JSX.Element
	onEdit?: () => void
	onDelete?: () => void
	/**
	 * Custom right-side actions (e.g. the transfer-leg delete fallback).
	 * Overrides the default `<CrudRow>` when provided.
	 */
	actions?: JSX.Element
}

/**
 * Shared compact list card: `card card--compact card-row` + title/meta +
 * `card-actions` (amount + edit/delete). Unifies the Events / Allocations /
 * Transactions list rows.
 */
export default function EntityCard(props: EntityCardProps): JSX.Element {
	return (
		<div class="card card--compact card-row">
			<div>
				<div class="title">{props.title}</div>
				<Show when={props.meta != null}>
					<div class="muted text-sm">{props.meta}</div>
				</Show>
			</div>
			<div class="card-actions">
				<Show when={props.amount != null}>{props.amount}</Show>
				<Show
					when={props.actions ?? null}
					fallback={
						props.onEdit && props.onDelete ? (
							<CrudRow onEdit={props.onEdit} onDelete={props.onDelete} />
						) : null
					}
				>
					{(actions) => <>{actions}</>}
				</Show>
			</div>
		</div>
	)
}
