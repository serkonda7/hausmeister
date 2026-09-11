import { type JSX, Show } from 'solid-js'
import { t } from '../lib/i18n'
import Dialog from './Dialog'

interface CrudFormProps {
	open: boolean
	error: string
	editing: unknown
	onSubmit: (e: Event) => void
	onCancel: () => void
	/** Disables the submit button (e.g. transfer with identical accounts). */
	submitDisabled?: boolean
	children: JSX.Element
}

/**
 * Shared CRUD form shell: {@link Dialog} + inner `<form>` + error row +
 * Cancel/Save actions. Wraps the caller's fields (`children`); inputs keep
 * using `patchForm`. Rendered only when `open`.
 *
 * - Autofocuses the first editable field whenever the form opens.
 * - `Esc` anywhere inside the form cancels (closes) it.
 */
export default function CrudForm(props: CrudFormProps): JSX.Element {
	return (
		<Dialog open={props.open} onCancel={props.onCancel}>
			<form onSubmit={props.onSubmit}>
				{props.children}
				<Show when={props.error}>
					<p class="form-error">{props.error}</p>
				</Show>
				<div class="form-actions">
					<button type="button" onClick={props.onCancel} class="btn-ghost">
						{t().common.cancel}
					</button>
					<button type="submit" class="btn-primary" disabled={props.submitDisabled}>
						{props.editing ? t().common.save : t().common.create}
					</button>
				</div>
			</form>
		</Dialog>
	)
}
