import { IconEdit, IconTrash } from '@tabler/icons-solidjs'
import { For, Show } from 'solid-js'
import { t } from '../i18n'
import type { Book, ProvenanceEvent, PublicUser } from '../types'
import {
	formatRecordDate,
	ownerName,
	ownershipLabel,
	provenanceDetails,
	provenanceLabel,
	userLabel,
} from '../utils/books'
import { type BookFieldsProps, BookMetadataFields, ProvenanceDraftFields } from './BookFormFields'
import { ErrorText, SubmitButton } from './common'
import { Dialog } from './Dialog'

export type EditBookDialogProps = BookFieldsProps & {
	editing: Book
	isAdmin: boolean
	users: PublicUser[]
}

export function EditBookDialog(props: EditBookDialogProps) {
	const book = () => props.editing

	function submit(e: Event): void {
		e.preventDefault()
		void props.book.saveEditedBook()
	}

	const ownerField = (
		<div class="field-group">
			<Show
				when={props.isAdmin}
				fallback={
					<>
						<span class="field-label">{t('book.owner')}</span>
						<p class="muted small" style="margin: 0">
							{ownerName(book()) || '—'}
						</p>
					</>
				}
			>
				<span class="field-label">{t('editBook.ownerAdmin')}</span>
				<select
					value={props.book.form().ownerId}
					onChange={(e) => props.book.setField('ownerId', e.currentTarget.value)}
					aria-label={t('editBook.ownerAria')}
				>
					<option value="">{t('editBook.unowned')}</option>
					<For each={props.users}>{(u) => <option value={u.id}>{userLabel(u)}</option>}</For>
				</select>
			</Show>
		</div>
	)

	const eventList = (
		<Show
			when={book().provenance.length > 0}
			fallback={<p class="muted small">{t('editBook.noEvents')}</p>}
		>
			<ul class="manage-list">
				<For each={book().provenance}>
					{(e) => (
						<EventRow
							event={e}
							onRemove={() => void props.book.removeProvenanceEvent(book().id, e.id)}
						/>
					)}
				</For>
			</ul>
		</Show>
	)

	return (
		<Dialog
			id="edit-book"
			title={t('editBook.title')}
			closeLabel={t('editBook.close')}
			onClose={props.book.closeEditBook}
			isDirty={props.book.isEditDirty}
		>
			<form onSubmit={submit}>
				<div class="form-grid book-form-grid">
					<BookMetadataFields {...props} idPrefix="edit-book" />
					{ownerField}
					<div class="span-2 field-group">
						<span class="field-label">
							{t('editBook.lifecycle')} ({book().provenance.length}) ·{' '}
							{ownershipLabel(book().ownership)}
						</span>
						{eventList}
						<ProvenanceDraftFields
							book={props.book}
							gridClass="form-grid-4"
							eventAriaLabel={t('editBook.newEventKind')}
							includeSell
						/>
						<p class="hint">{t('editBook.eventHint')}</p>
					</div>
				</div>
				<ErrorText message={props.book.error()} />
				<p class="muted small" style="margin: 0">
					{t('editBook.added')}: {formatRecordDate(book().createdAt) || '—'} ·{' '}
					{t('editBook.modified')}: {formatRecordDate(book().updatedAt) || '—'}
				</p>
				<div class="form-actions">
					<button type="button" class="ghost" onClick={props.book.closeEditBook}>
						{t('common.cancel')}
					</button>
					<SubmitButton
						busy={props.book.saving()}
						busyLabel={t('common.saving')}
						icon={<IconEdit size={16} />}
					>
						{t('common.saveChanges')}
					</SubmitButton>
				</div>
			</form>
		</Dialog>
	)
}

function EventRow(props: { event: ProvenanceEvent; onRemove: () => void }) {
	const label = () => provenanceLabel(props.event.kind)
	return (
		<li class="manage-row">
			<span>
				<strong>{label()}</strong>
				<For each={provenanceDetails(props.event)}>{(part) => ` · ${part}`}</For>
			</span>
			<span class="manage-actions">
				<button
					type="button"
					class="danger-ghost"
					onClick={props.onRemove}
					aria-label={t('editBook.deleteEvent', { kind: label() })}
				>
					<IconTrash size={14} />
				</button>
			</span>
		</li>
	)
}
