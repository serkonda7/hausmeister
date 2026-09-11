import { type JSX, Show } from 'solid-js'

interface DialogProps {
	open: boolean
	onCancel: () => void
	/** Accessible name for `role="dialog"`. */
	label?: string
	children: JSX.Element
}

/**
 * Generic dialog shell: `<div class="form-card" role="dialog">` + autofocus
 * of the first editable field on open + `Esc` to cancel. Shared by
 * {@link CrudForm} and one-off dialogs (e.g. the Currencies download
 * dialog) so neither reimplements the focus/`Esc`/card boilerplate.
 */
export default function Dialog(props: DialogProps): JSX.Element {
	const focusSelector = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled])'

	function handleRef(el: HTMLDivElement): void {
		// `ref` re-runs every time the `<Show>` below mounts the dialog,
		// so this focuses the first field on each open.
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
			<div
				ref={handleRef}
				onKeyDown={handleKeyDown}
				role="dialog"
				aria-label={props.label}
				class="form-card"
			>
				{props.children}
			</div>
		</Show>
	)
}
