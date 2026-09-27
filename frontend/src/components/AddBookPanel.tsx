import { IconLoader2, IconPlus } from '@tabler/icons-solidjs'
import { Show } from 'solid-js'
import {
	BookMetadataFields,
	type BookMetadataFieldsProps,
	ProvenanceDraftFields,
} from './BookFormFields'

export type AddBookPanelProps = BookMetadataFieldsProps & {
	saving: boolean
	formError: string | null
	onSubmit: (e: Event) => void
	onSubmitAnother: (e: Event) => void
	onCancel: () => void
}

export function AddBookPanel(props: AddBookPanelProps) {
	function handleSubmit(e: SubmitEvent): void {
		const submitter = e.submitter as HTMLElement | null
		// Implicit submission (plain Enter) defaults to "Save & create
		// another"; only an explicit Save button activation uses plain save.
		if (submitter?.dataset.action === 'save') {
			props.onSubmit(e)
		} else {
			props.onSubmitAnother(e)
		}
	}

	function handleFormKeyDown(e: KeyboardEvent): void {
		if (e.key !== 'Enter') return
		const target = e.target as HTMLElement | null
		if (!target) return
		const isSaveShortcut = e.ctrlKey || e.metaKey
		// An explicitly focused button/link/option keeps its native
		// activation so keyboard users can still trigger plain Save.
		if (target.closest('button, a, [role="option"]')) return
		if (!isSaveShortcut) {
			// Plain Enter keeps native behavior on controls that use it:
			// summaries toggle, selects open, textareas newline, checkboxes
			// toggle (handled in BookFormFields). Everywhere else (text,
			// number, date inputs, …) Enter means "Save & create another".
			// (Inline-create search inputs consume plain Enter themselves
			// and stop propagation when they create an entry.)
			if (target.closest('summary, select, textarea')) return
			if (target instanceof HTMLInputElement && target.type === 'checkbox') return
		}
		e.preventDefault()
		if (isSaveShortcut) {
			props.onSubmit(e)
		} else {
			props.onSubmitAnother(e)
		}
	}

	return (
		<section class="panel form-panel">
			<h2>Add a book</h2>
			<form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
				<div class="form-grid book-form-grid">
					<BookMetadataFields {...props} fieldIdPrefix="add-book" />
					<div class="span-2 field-group">
						<span class="field-label">Acquisition (optional)</span>
						<ProvenanceDraftFields
							form={props.form}
							onField={props.onField}
							gridClass="add-book-acquisition-grid"
							eventAriaLabel="Initial lifecycle event"
							includeSell={false}
							priceFirst
						/>
					</div>
				</div>
				<Show when={props.formError}>
					<p class="error">{props.formError}</p>
				</Show>
				<div class="form-actions">
					<button type="button" class="ghost" onClick={props.onCancel}>
						Cancel
					</button>
					<button
						type="submit"
						data-action="save"
						class="primary"
						disabled={props.saving}
						title="Save (Ctrl+Enter)"
						aria-keyshortcuts="Control+Enter Meta+Enter"
					>
						<Show when={props.saving} fallback={<IconPlus size={16} />}>
							<IconLoader2 size={16} class="spin" />
						</Show>
						{props.saving ? 'Saving…' : 'Save'}
					</button>
					<button
						type="submit"
						data-action="another"
						class="secondary save-another"
						disabled={props.saving}
						title="Save & create another (Enter)"
						aria-keyshortcuts="Enter"
					>
						<Show when={props.saving} fallback={<IconPlus size={16} />}>
							<IconLoader2 size={16} class="spin" />
						</Show>
						{props.saving ? 'Saving…' : 'Save & create another'}
					</button>
				</div>
			</form>
		</section>
	)
}
