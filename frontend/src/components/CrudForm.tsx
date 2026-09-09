import { Show, type JSX } from 'solid-js'

interface CrudFormProps {
	open: boolean
	error: string
	editing: unknown
	onSubmit: (e: Event) => void
	onCancel: () => void
	children: JSX.Element
}

/**
 * Shared CRUD form shell: `<form class="form-card">` + error row +
 * Cancel/Save actions. Wraps the caller's fields (`children`); inputs keep
 * using `patchForm`. Rendered only when `open`.
 */
export default function CrudForm(props: CrudFormProps): JSX.Element {
	return (
		<Show when={props.open}>
			<form onSubmit={props.onSubmit} class="form-card">
				{props.children}
				<Show when={props.error}>
					<p class="form-error">{props.error}</p>
				</Show>
				<div class="form-actions">
					<button type="button" onClick={props.onCancel} class="btn-ghost">
						Cancel
					</button>
					<button type="submit" class="btn-primary">
						{props.editing ? 'Save' : 'Create'}
					</button>
				</div>
			</form>
		</Show>
	)
}
