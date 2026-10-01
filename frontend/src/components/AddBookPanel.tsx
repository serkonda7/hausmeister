import { IconLoader2, IconPlus } from '@tabler/icons-solidjs'
import { Show } from 'solid-js'
import { t } from '../i18n'
import { type BookFieldsProps, BookMetadataFields, ProvenanceDraftFields } from './BookFormFields'
import { ErrorText } from './common'

export type AddBookPanelProps = BookFieldsProps & {
	/** Save the book; `another` keeps the form open for the next copy. */
	onSave: (another: boolean) => Promise<boolean>
	onCancel: () => void
}

export function AddBookPanel(props: AddBookPanelProps) {
	async function save(another: boolean): Promise<void> {
		if (!(await props.onSave(another)) || !another) return
		window.scrollTo({ top: 0, behavior: 'smooth' })
		document.getElementById('add-book-title')?.focus({ preventScroll: true })
	}

	function handleSubmit(e: SubmitEvent): void {
		e.preventDefault()
		// Implicit submission (plain Enter) defaults to "Save & create
		// another"; only an explicit Save button activation uses plain save.
		void save((e.submitter as HTMLElement | null)?.dataset.action !== 'save')
	}

	function handleFormKeyDown(e: KeyboardEvent): void {
		const target = e.target as HTMLElement | null
		if (e.key !== 'Enter' || !target) return
		const isSaveShortcut = e.ctrlKey || e.metaKey
		// An explicitly focused button/link/option keeps its native
		// activation so keyboard users can still trigger plain Save.
		if (target.closest('button, a, [role="option"]')) return
		// Plain Enter keeps native behavior on controls that use it:
		// summaries toggle, selects open, textareas newline, checkboxes
		// toggle (handled in Dropdown). Everywhere else (text, number,
		// date inputs, …) Enter means "Save & create another".
		// (Inline-create search inputs consume plain Enter themselves
		// and stop propagation when they create an entry.)
		const keepsNativeEnter =
			target.closest('summary, select, textarea') ||
			(target instanceof HTMLInputElement && target.type === 'checkbox')
		if (!isSaveShortcut && keepsNativeEnter) return
		e.preventDefault()
		void save(!isSaveShortcut)
	}

	const saveButton = (action: 'save' | 'another') => (
		<button
			type="submit"
			data-action={action}
			class={action === 'save' ? 'primary' : 'secondary save-another'}
			disabled={props.book.saving()}
			title={t(action === 'save' ? 'addBook.saveTitle' : 'addBook.saveAnotherTitle')}
			aria-keyshortcuts={action === 'save' ? 'Control+Enter Meta+Enter' : 'Enter'}
		>
			<Show when={props.book.saving()} fallback={<IconPlus size={16} />}>
				<IconLoader2 size={16} class="spin" />
			</Show>
			<Show when={!props.book.saving()} fallback={t('common.saving')}>
				{action === 'save' ? t('common.save') : t('addBook.saveAnother')}
			</Show>
		</button>
	)

	return (
		<section class="panel form-panel">
			<h2>{t('addBook.title')}</h2>
			<form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown}>
				<div class="form-grid book-form-grid">
					<BookMetadataFields {...props} idPrefix="add-book" />
					<div class="span-2 field-group">
						<span class="field-label">{t('addBook.acquisition')}</span>
						<ProvenanceDraftFields
							book={props.book}
							gridClass="add-book-acquisition-grid"
							eventAriaLabel={t('addBook.initialEvent')}
							includeSell={false}
							priceFirst
						/>
					</div>
				</div>
				<ErrorText message={props.book.error()} />
				<div class="form-actions">
					<button type="button" class="ghost" onClick={props.onCancel}>
						{t('common.cancel')}
					</button>
					{saveButton('save')}
					{saveButton('another')}
				</div>
			</form>
		</section>
	)
}
