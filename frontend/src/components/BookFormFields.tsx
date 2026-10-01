import { PROVENANCE_KINDS } from 'shared/src/book'
import { Index, Show } from 'solid-js'
import type { BookForm, MultiSelectField } from '../hooks/useBookForm'
import type { CatalogKind, CatalogLists } from '../hooks/useCatalog'
import { type TranslationKey, t } from '../i18n'
import type { BookFormState, PageNote } from '../types'
import { locationLabel, provenanceLabel, sortLocations } from '../utils/books'
import { ClearableInput } from './ClearableInput'
import { TextField } from './common'
import { MultiSelect, SingleSelect } from './Dropdown'

export type BookFieldsProps = {
	book: BookForm
	lists: CatalogLists
	onCreate: (kind: CatalogKind, name: string) => void
}

type MultiField = {
	kind: 'authors' | 'tags' | 'languages'
	field: MultiSelectField
	label: TranslationKey
	empty: TranslationKey
	search: TranslationKey
	wide?: boolean
}

const MULTI_FIELDS = {
	authors: {
		kind: 'authors',
		field: 'authorIds',
		label: 'book.authors',
		empty: 'form.selectAuthors',
		search: 'form.searchAddAuthor',
		wide: true,
	},
	tags: {
		kind: 'tags',
		field: 'tagIds',
		label: 'book.tags',
		empty: 'form.selectTags',
		search: 'form.searchAddTag',
	},
	languages: {
		kind: 'languages',
		field: 'languageIds',
		label: 'book.languages',
		empty: 'form.selectLanguages',
		search: 'form.searchAddLanguage',
	},
} satisfies Record<string, MultiField>

function MultiSelectGroup(props: BookFieldsProps & { config: MultiField }) {
	const selectedIds = () => props.book.form()[props.config.field]
	return (
		<div class={props.config.wide ? 'span-2 field-group' : 'field-group'}>
			<span class="field-label">{t(props.config.label)}</span>
			<MultiSelect
				emptySummary={t(props.config.empty)}
				items={props.lists[props.config.kind].items()}
				selectedIds={selectedIds()}
				onToggle={(id) => props.book.toggle(props.config.field, id)}
				searchLabel={t(props.config.search)}
				onCreate={(name) => props.onCreate(props.config.kind, name)}
			/>
		</div>
	)
}

/** Title, authors, publisher, … — the fields shared by the add and edit forms. */
export function BookMetadataFields(props: BookFieldsProps & { idPrefix: string }) {
	const form = () => props.book.form()
	const fieldId = (name: string) => `${props.idPrefix}-${name}`
	const locations = () => sortLocations(props.lists.locations.items())
	const locationParentHint = () => {
		const parent = locations().find((l) => l.id === form().locationId)
		return parent && t('form.underLocation', { name: locationLabel(parent) })
	}
	const textField = (key: 'title' | 'subtitle' | 'isbn', label: TranslationKey) => (
		<TextField
			id={fieldId(key)}
			label={t(label)}
			value={form()[key]}
			onInput={(value) => props.book.setField(key, value)}
			placeholder={key === 'title' ? t('book.titlePlaceholder') : t('common.optional')}
			required={key === 'title'}
			labelClass={key === 'isbn' ? undefined : 'span-2'}
		/>
	)

	return (
		<>
			{textField('title', 'book.title')}
			{textField('subtitle', 'book.subtitle')}
			<MultiSelectGroup {...props} config={MULTI_FIELDS.authors} />
			<div class="field-group">
				<span class="field-label">{t('book.publisher')}</span>
				<SingleSelect
					noneLabel={t('form.noPublisher')}
					options={props.lists.publishers.items().map((p) => ({ id: p.id, label: p.name }))}
					value={form().publisherId}
					onSelect={(id) => props.book.setField('publisherId', id)}
					searchLabel={t('form.searchAddPublisher')}
					onCreate={(name) => props.onCreate('publishers', name)}
				/>
			</div>
			<TextField
				id={fieldId('print-year')}
				label={t('book.printYear')}
				type="number"
				step="1"
				placeholder="1969"
				value={form().printYear}
				onInput={(value) => props.book.setField('printYear', value)}
			/>
			{textField('isbn', 'book.isbn')}
			<MultiSelectGroup {...props} config={MULTI_FIELDS.tags} />
			<MultiSelectGroup {...props} config={MULTI_FIELDS.languages} />
			<PageNoteEditor
				kind="dedication"
				title={t('book.dedications')}
				notes={form().dedications}
				onChange={(notes) => props.book.setField('dedications', notes)}
				idPrefix={fieldId('dedications')}
			/>
			<PageNoteEditor
				kind="damage"
				title={t('book.damages')}
				notes={form().damages}
				onChange={(notes) => props.book.setField('damages', notes)}
				idPrefix={fieldId('damages')}
			/>
			<div class="field-group">
				<span class="field-label">{t('book.location')}</span>
				<SingleSelect
					noneLabel={t('form.noLocation')}
					options={locations().map((l) => ({ id: l.id, label: locationLabel(l) }))}
					value={form().locationId}
					onSelect={(id) => props.book.setField('locationId', id)}
					searchLabel={t('form.searchAddLocation')}
					onCreate={(name) => props.onCreate('locations', name)}
					createHint={locationParentHint()}
				/>
			</div>
		</>
	)
}

export type ProvenanceDraftFieldsProps = {
	book: BookForm
	gridClass: 'add-book-acquisition-grid' | 'form-grid-4'
	eventAriaLabel: string
	includeSell: boolean
	priceFirst?: boolean
}

/** Inputs for an optional lifecycle event saved together with the book. */
export function ProvenanceDraftFields(props: ProvenanceDraftFieldsProps) {
	const form = () => props.book.form()
	const id = (name: string) => `provenance-${name}-${props.gridClass}`
	const kinds = () => PROVENANCE_KINDS.filter((kind) => props.includeSell || kind !== 'sell')
	const kindLabel = (kind: string) =>
		kind === 'other'
			? provenanceLabel(kind)
			: t(kind === 'buy' ? 'prov.buyOption' : 'prov.sellOption')
	const draftField = (
		key: keyof BookFormState & `prov${string}`,
		name: string,
		label: TranslationKey,
		extra: { type?: string; min?: string; step?: string; placeholder?: string } = {},
	) => (
		<TextField
			{...extra}
			id={id(name)}
			label={t(label)}
			value={form()[key]}
			onInput={(value) => props.book.setField(key, value)}
		/>
	)
	const priceField = () =>
		draftField('provPrice', 'price', 'prov.price', {
			type: 'number',
			min: '0',
			step: '0.01',
			placeholder: t('prov.pricePlaceholder'),
		})

	return (
		<div class={`form-grid ${props.gridClass}`}>
			<label for={id('kind')}>
				<span>{t('prov.event')}</span>
				<select
					id={id('kind')}
					value={form().provKind}
					onChange={(e) => props.book.setField('provKind', e.currentTarget.value)}
					aria-label={props.eventAriaLabel}
				>
					<option value="">{t('prov.none')}</option>
					{kinds().map((kind) => (
						<option value={kind}>{kindLabel(kind)}</option>
					))}
				</select>
			</label>
			<Show when={props.priceFirst}>{priceField()}</Show>
			{draftField('provDate', 'date', 'prov.date', { type: 'date' })}
			{draftField('provParty', 'party', 'prov.party', { placeholder: t('prov.partyPlaceholder') })}
			<Show when={!props.priceFirst}>{priceField()}</Show>
		</div>
	)
}

type PageNoteEditorProps = {
	kind: 'dedication' | 'damage'
	title: string
	notes: PageNote[]
	onChange: (notes: PageNote[]) => void
	idPrefix: string
}

/** Repeatable (page, text) pair editor used for dedications and damages. */
function PageNoteEditor(props: PageNoteEditorProps) {
	const kindLabel = () => t(`pageNote.${props.kind}`)
	const update = (index: number, patch: Partial<PageNote>) =>
		props.onChange(props.notes.map((n, i) => (i === index ? { ...n, ...patch } : n)))
	const remove = (index: number) => props.onChange(props.notes.filter((_, i) => i !== index))
	const add = () => props.onChange([...props.notes, { page: '', text: '' }])

	const row = (note: () => PageNote, i: number) => {
		const aria = { kind: kindLabel(), n: i + 1 }
		return (
			<div class="page-note-row">
				<ClearableInput
					id={`${props.idPrefix}-page-${i}`}
					class="page-note-page"
					placeholder={t('pageNote.page')}
					value={note().page}
					onInput={(e) => update(i, { page: e.currentTarget.value })}
					aria-label={t('pageNote.pageAria', aria)}
				/>
				<ClearableInput
					id={`${props.idPrefix}-text-${i}`}
					class="page-note-text"
					placeholder={t(
						props.kind === 'dedication' ? 'pageNote.dedicationText' : 'pageNote.damageText',
					)}
					value={note().text}
					onInput={(e) => update(i, { text: e.currentTarget.value })}
					aria-label={t('pageNote.textAria', aria)}
				/>
				<button
					type="button"
					class="danger-ghost icon-btn"
					onClick={() => remove(i)}
					aria-label={t('pageNote.removeAria', aria)}
					title={t('pageNote.removeTitle', { kind: kindLabel() })}
				>
					×
				</button>
			</div>
		)
	}

	return (
		<div class="field-group">
			<span class="field-label">
				{props.title} <Show when={props.notes.length > 0}>({props.notes.length})</Show>
			</span>
			<div class="page-note-list">
				{/* Index (not For): rows are reconciled by position, so typing in a
					row never disposes/recreates its inputs (For matches by item
					identity, and each keystroke produces a new item object). */}
				<Index each={props.notes}>{row}</Index>
				<div>
					<button type="button" class="ghost small-btn" onClick={add}>
						+ {t(props.kind === 'dedication' ? 'pageNote.addDedication' : 'pageNote.addDamage')}
					</button>
				</div>
			</div>
		</div>
	)
}
