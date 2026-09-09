import { type JSX, Show } from 'solid-js'

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
 *
 * - Autofocuses the first editable field whenever the form opens.
 * - `Esc` anywhere inside the form cancels (closes) it.
 */
export default function CrudForm(props: CrudFormProps): JSX.Element {
	const focusSelector = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

	function handleRef(el: HTMLFormElement): void {
		// `ref` re-runs every time the `<Show>` above mounts the form,
		// so this focuses the first field on each open (create + edit).
		el.querySelector<HTMLElement>(focusSelector)?.focus()
	}

	function handleKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			e.stopPropagation()
			props.onCancel()
		}
	}

	return (
		<Show when={props.open}>
			<form
				ref={handleRef}
				onKeyDown={handleKeyDown}
				onSubmit={props.onSubmit}
				class="form-card"
			>
				{props.children}
				<Show when={props.error}>
					<p class="form-error">{props.error}</p>
				</Show>
				<div class="form-actions">
					<button type="button" onClick={props.onCancel} class="btn-ghost">
						Abbrechen
					</button>
					<button type="submit" class="btn-primary">
						{props.editing ? 'Speichern' : 'Erstellen'}
					</button>
				</div>
			</form>
		</Show>
	)
}
