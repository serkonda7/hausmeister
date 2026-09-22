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
		if (submitter?.dataset.action === 'another') {
			props.onSubmitAnother(e)
		} else {
			props.onSubmit(e)
		}
	}

	return (
		<section class="panel form-panel">
			<h2>Add a book</h2>
			<form onSubmit={handleSubmit}>
				<div class="form-grid book-form-grid">
					<BookMetadataFields {...props} />
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
					<button type="submit" data-action="save" class="primary" disabled={props.saving}>
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
