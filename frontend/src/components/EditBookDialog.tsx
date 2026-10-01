import { IconEdit, IconLoader2, IconTrash, IconX } from '@tabler/icons-solidjs'
import { For, Show } from 'solid-js'
import { t } from '../i18n'
import type { Book, ManagedUser } from '../types'
import {
	formatProvenanceDate,
	formatProvenancePrice,
	formatRecordDate,
	ownershipLabel,
	provenanceLabel,
	userLabel,
} from '../utils/books'
import {
	BookMetadataFields,
	type BookMetadataFieldsProps,
	ProvenanceDraftFields,
} from './BookFormFields'

export type EditBookDialogProps = BookMetadataFieldsProps & {
	book: Book
	isAdmin: boolean
	users: ManagedUser[]
	selectedOwnerId: string
	onSelectOwner: (id: string) => void
	saving: boolean
	error: string | null
	onSubmit: (e: Event) => void
	onClose: () => void
	onBackdropClose: () => void
	onRemoveProvenance: (bookId: string, eventId: string) => void
}

export function EditBookDialog(props: EditBookDialogProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dialog backdrop dismisses on mouse click; keyboard users have Cancel and Escape.
		<div
			class="dialog-backdrop"
			role="presentation"
			onClick={(e) => {
				if (e.target === e.currentTarget) props.onBackdropClose()
			}}
		>
			<section
				class="dialog panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="edit-book-title"
			>
				<div class="dialog-heading">
					<h2 id="edit-book-title">{t('editBook.title')}</h2>
					<button
						type="button"
						class="clear"
						onClick={props.onClose}
						aria-label={t('editBook.close')}
					>
						<IconX size={18} />
					</button>
				</div>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid book-form-grid">
						<BookMetadataFields {...props} fieldIdPrefix="edit-book" />
						<Show when={props.isAdmin}>
							<div class="field-group">
								<span class="field-label">{t('editBook.ownerAdmin')}</span>
								<select
									value={props.selectedOwnerId}
									onChange={(e) => props.onSelectOwner(e.currentTarget.value)}
									aria-label={t('editBook.ownerAria')}
								>
									<option value="">{t('editBook.unowned')}</option>
									<For each={props.users}>
										{(u) => <option value={u.id}>{userLabel(u)}</option>}
									</For>
								</select>
							</div>
						</Show>
						<Show when={!props.isAdmin}>
							<div class="field-group">
								<span class="field-label">{t('book.owner')}</span>
								<p class="muted small" style="margin: 0">
									{props.book.owner
										? (props.book.owner.displayName ?? props.book.owner.username)
										: '—'}
								</p>
							</div>
						</Show>
						<div class="span-2 field-group">
							<span class="field-label">
								{t('editBook.lifecycle')} ({(props.book.provenance ?? []).length}) ·{' '}
								{ownershipLabel(props.book.ownership ?? 'unknown')}
							</span>
							<Show
								when={(props.book.provenance ?? []).length > 0}
								fallback={<p class="muted small">{t('editBook.noEvents')}</p>}
							>
								<ul class="manage-list">
									<For each={props.book.provenance ?? []}>
										{(e) => (
											<li class="manage-row">
												<span>
													<strong>{provenanceLabel(e.kind)}</strong>
													<Show when={e.party}> · {e.party}</Show>
													<Show when={formatProvenanceDate(e.occurredAt)}>
														{' '}
														· {formatProvenanceDate(e.occurredAt)}
													</Show>
													<Show when={formatProvenancePrice(e)}>
														{' · '}
														{formatProvenancePrice(e)}
													</Show>
												</span>
												<span class="manage-actions">
													<button
														type="button"
														class="danger-ghost"
														onClick={() => props.onRemoveProvenance(props.book.id, e.id)}
														aria-label={t('editBook.deleteEvent', {
															kind: provenanceLabel(e.kind),
														})}
													>
														<IconTrash size={14} />
													</button>
												</span>
											</li>
										)}
									</For>
								</ul>
							</Show>
							<ProvenanceDraftFields
								form={props.form}
								onField={props.onField}
								gridClass="form-grid-4"
								eventAriaLabel={t('editBook.newEventKind')}
								includeSell
							/>
							<p class="hint">{t('editBook.eventHint')}</p>
						</div>
					</div>
					<Show when={props.error}>
						<p class="error">{props.error}</p>
					</Show>
					<p class="muted small" style="margin: 0">
						{t('editBook.added')}: {formatRecordDate(props.book.createdAt) || '—'} ·{' '}
						{t('editBook.modified')}: {formatRecordDate(props.book.updatedAt) || '—'}
					</p>
					<div class="form-actions">
						<button type="button" class="ghost" onClick={props.onClose}>
							{t('common.cancel')}
						</button>
						<button type="submit" class="primary" disabled={props.saving}>
							<Show when={props.saving} fallback={<IconEdit size={16} />}>
								<IconLoader2 size={16} class="spin" />
							</Show>
							{props.saving ? t('common.saving') : t('common.saveChanges')}
						</button>
					</div>
				</form>
			</section>
		</div>
	)
}
