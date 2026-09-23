import { createMemo, For, Index, Show } from 'solid-js'
import type { Author, BookFormState, Language, Location, PageNote, Publisher, Tag } from '../types'
import { locationOptions } from '../utils/books'
import { ClearableInput } from './ClearableInput'

export type BookFormFieldValue = string | PageNote[]

export type BookMetadataFieldsProps = {
	fieldIdPrefix?: string
	form: BookFormState
	onField: (key: keyof BookFormState, value: BookFormFieldValue) => void
	authors: Author[]
	authorSummary: string
	selectedAuthorIds: string[]
	onToggleAuthor: (id: string) => void
	publishers: Publisher[]
	selectedPublisherId: string
	onSelectPublisher: (id: string) => void
	locations: Location[]
	selectedLocationId: string
	onSelectLocation: (id: string) => void
	tags: Tag[]
	tagSummary: string
	selectedTagIds: string[]
	onToggleTag: (id: string) => void
	newAuthorName: string
	onNewAuthorName: (v: string) => void
	onAddAuthor: () => void
	newPublisherName: string
	onNewPublisherName: (v: string) => void
	onAddPublisher: () => void
	newLocationName: string
	onNewLocationName: (v: string) => void
	onAddLocation: () => void
	newTagName: string
	onNewTagName: (v: string) => void
	onAddTag: () => void
	languages: Language[]
	languageSummary: string
	selectedLanguageIds: string[]
	onToggleLanguage: (id: string) => void
	newLanguageName: string
	onNewLanguageName: (v: string) => void
	onAddLanguage: () => void
}

export function BookMetadataFields(props: BookMetadataFieldsProps) {
	const fieldId = (name: string) => `${props.fieldIdPrefix ?? 'book'}-${name}`
	const locationParentHint = (): string | undefined => {
		const id = props.selectedLocationId
		if (!id) return undefined
		const parent = locationOptions(props.locations).find((l) => l.id === id)
		return parent ? `under “${parent.fullPath ?? parent.name}”` : undefined
	}

	return (
		<>
			<label class="span-2" for={fieldId('title')}>
				<span>
					Title <em>*</em>
				</span>
				<ClearableInput
					id={fieldId('title')}
					placeholder="e.g. The Left Hand of Darkness"
					value={props.form.title}
					onInput={(e) => props.onField('title', e.currentTarget.value)}
					required
				/>
			</label>
			<label class="span-2" for={fieldId('subtitle')}>
				<span>Subtitle</span>
				<ClearableInput
					id={fieldId('subtitle')}
					placeholder="Optional"
					value={props.form.subtitle}
					onInput={(e) => props.onField('subtitle', e.currentTarget.value)}
				/>
			</label>
			<div class="span-2 field-group">
				<span class="field-label">Author(s)</span>
				<MultiSelect
					summary={props.authorSummary}
					items={props.authors}
					selectedIds={props.selectedAuthorIds}
					onToggle={props.onToggleAuthor}
					search={props.newAuthorName}
					onSearch={props.onNewAuthorName}
					searchLabel="Search or add author"
					onCreate={props.onAddAuthor}
				/>
			</div>
			<div class="field-group">
				<span class="field-label">Publisher</span>
				<CreatableSingleSelect
					placeholder="— No publisher —"
					clearLabel="— No publisher —"
					options={props.publishers.map((pub) => ({ id: pub.id, label: pub.name }))}
					value={props.selectedPublisherId}
					onSelect={props.onSelectPublisher}
					search={props.newPublisherName}
					onSearch={props.onNewPublisherName}
					searchLabel="Search or add publisher"
					onCreate={props.onAddPublisher}
				/>
			</div>
			<label for={fieldId('print-year')}>
				<span>Print year</span>
				<ClearableInput
					id={fieldId('print-year')}
					type="number"
					step="1"
					placeholder="1969"
					value={props.form.printYear}
					onInput={(e) => props.onField('printYear', e.currentTarget.value)}
				/>
			</label>
			<label for={fieldId('isbn')}>
				<span>ISBN</span>
				<ClearableInput
					id={fieldId('isbn')}
					placeholder="Optional"
					value={props.form.isbn}
					onInput={(e) => props.onField('isbn', e.currentTarget.value)}
				/>
			</label>
			<div class="field-group">
				<span class="field-label">Tag(s)</span>
				<MultiSelect
					summary={props.tagSummary}
					items={props.tags}
					selectedIds={props.selectedTagIds}
					onToggle={props.onToggleTag}
					search={props.newTagName}
					onSearch={props.onNewTagName}
					searchLabel="Search or add tag"
					onCreate={props.onAddTag}
				/>
			</div>
			<div class="field-group">
				<span class="field-label">Language(s)</span>
				<MultiSelect
					summary={props.languageSummary}
					items={props.languages}
					selectedIds={props.selectedLanguageIds}
					onToggle={props.onToggleLanguage}
					search={props.newLanguageName}
					onSearch={props.onNewLanguageName}
					searchLabel="Search or add language"
					onCreate={props.onAddLanguage}
				/>
			</div>
			<PageNoteEditor
				title="Dedications"
				notes={props.form.dedications}
				onChange={(notes) => props.onField('dedications', notes)}
				pagePlaceholder="Page"
				textPlaceholder="Inscription"
				addLabel="Add dedication"
				kind="dedication"
				fieldIdPrefix={`${fieldId('dedications')}`}
			/>
			<PageNoteEditor
				title="Damages"
				notes={props.form.damages}
				onChange={(notes) => props.onField('damages', notes)}
				pagePlaceholder="Page"
				textPlaceholder="Damage"
				addLabel="Add damage"
				kind="damage"
				fieldIdPrefix={`${fieldId('damages')}`}
			/>
			<div class="field-group">
				<span class="field-label">Location</span>
				<CreatableSingleSelect
					placeholder="— No location —"
					clearLabel="— No location —"
					options={locationOptions(props.locations).map((l) => ({
						id: l.id,
						label: l.fullPath ?? l.name,
					}))}
					value={props.selectedLocationId}
					onSelect={props.onSelectLocation}
					search={props.newLocationName}
					onSearch={props.onNewLocationName}
					searchLabel="Search or add location"
					onCreate={props.onAddLocation}
					createHint={locationParentHint()}
				/>
			</div>
		</>
	)
}

export type ProvenanceDraftFieldsProps = {
	form: BookFormState
	onField: (key: keyof BookFormState, value: BookFormFieldValue) => void
	gridClass: 'add-book-acquisition-grid' | 'form-grid-4'
	eventAriaLabel: string
	includeSell: boolean
	priceFirst?: boolean
}

export function ProvenanceDraftFields(props: ProvenanceDraftFieldsProps) {
	const eventField = () => (
		<label for={`provenance-kind-${props.gridClass}`}>
			<span>Event</span>
			<select
				id={`provenance-kind-${props.gridClass}`}
				value={props.form.provKind}
				onChange={(e) => props.onField('provKind', e.currentTarget.value)}
				aria-label={props.eventAriaLabel}
			>
				<option value="">— None —</option>
				<option value="buy">Bought / got it</option>
				<Show when={props.includeSell}>
					<option value="sell">Sold / gave away</option>
				</Show>
				<option value="other">Other</option>
			</select>
		</label>
	)
	const priceField = () => (
		<label for={`provenance-price-${props.gridClass}`}>
			<span>Price (EUR)</span>
			<ClearableInput
				id={`provenance-price-${props.gridClass}`}
				type="number"
				min="0"
				step="0.01"
				placeholder="0 = free, empty = unknown"
				value={props.form.provPrice}
				onInput={(e) => props.onField('provPrice', e.currentTarget.value)}
			/>
		</label>
	)
	const dateField = () => (
		<label for={`provenance-date-${props.gridClass}`}>
			<span>Date</span>
			<ClearableInput
				id={`provenance-date-${props.gridClass}`}
				type="date"
				value={props.form.provDate}
				onInput={(e) => props.onField('provDate', e.currentTarget.value)}
			/>
		</label>
	)
	const partyField = () => (
		<label for={`provenance-party-${props.gridClass}`}>
			<span>From whom / where</span>
			<ClearableInput
				id={`provenance-party-${props.gridClass}`}
				placeholder="Bookstore, Person..."
				value={props.form.provParty}
				onInput={(e) => props.onField('provParty', e.currentTarget.value)}
			/>
		</label>
	)

	return (
		<div class={`form-grid ${props.gridClass}`}>
			{eventField()}
			<Show when={props.priceFirst}>{priceField()}</Show>
			{dateField()}
			{partyField()}
			<Show when={!props.priceFirst}>{priceField()}</Show>
		</div>
	)
}

export type PageNoteEditorProps = {
	title: string
	notes: PageNote[]
	onChange: (notes: PageNote[]) => void
	pagePlaceholder: string
	textPlaceholder: string
	addLabel: string
	kind: 'dedication' | 'damage'
	fieldIdPrefix: string
}

/** Repeatable (page, text) pair editor used for dedications and damages. */
export function PageNoteEditor(props: PageNoteEditorProps) {
	function update(index: number, patch: Partial<PageNote>): void {
		props.onChange(props.notes.map((n, i) => (i === index ? { ...n, ...patch } : n)))
	}

	function remove(index: number): void {
		props.onChange(props.notes.filter((_, i) => i !== index))
	}

	function add(): void {
		props.onChange([...props.notes, { page: '', text: '' }])
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
				<Index each={props.notes}>
					{(note, i) => (
						<div class="page-note-row">
							<ClearableInput
								id={`${props.fieldIdPrefix}-page-${i}`}
								class="page-note-page"
								placeholder={props.pagePlaceholder}
								value={note().page}
								onInput={(e) => update(i, { page: e.currentTarget.value })}
								aria-label={`${props.kind} ${i + 1} page`}
							/>
							<ClearableInput
								id={`${props.fieldIdPrefix}-text-${i}`}
								class="page-note-text"
								placeholder={props.textPlaceholder}
								value={note().text}
								onInput={(e) => update(i, { text: e.currentTarget.value })}
								aria-label={`${props.kind} ${i + 1} text`}
							/>
							<button
								type="button"
								class="danger-ghost icon-btn"
								onClick={() => remove(i)}
								aria-label={`Remove ${props.kind} ${i + 1}`}
								title={`Remove ${props.kind}`}
							>
								×
							</button>
						</div>
					)}
				</Index>
				<div>
					<button type="button" class="ghost small-btn" onClick={add}>
						+ {props.addLabel}
					</button>
				</div>
			</div>
		</div>
	)
}

export type MultiSelectProps = {
	summary: string
	items: Array<{ id: string; name: string }>
	selectedIds: string[]
	onToggle: (id: string) => void
	search?: string
	onSearch?: (v: string) => void
	searchLabel?: string
	onCreate?: () => void
}

/** Expandable checkbox list used for authors/tags in the book forms. */
export function MultiSelect(props: MultiSelectProps) {
	const selectedItems = createMemo(() =>
		props.items.filter((item) => props.selectedIds.includes(item.id)),
	)

	const filtered = createMemo(() => {
		const q = (props.search ?? '').trim().toLowerCase()
		if (!q) return props.items
		return props.items.filter((item) => item.name.toLowerCase().includes(q))
	})

	const trimmedSearch = createMemo(() => (props.search ?? '').trim())

	const canCreate = createMemo(
		() =>
			props.onCreate !== undefined &&
			trimmedSearch() !== '' &&
			!props.items.some((item) => item.name.toLowerCase() === trimmedSearch().toLowerCase()),
	)

	function handleToggle(e: Event): void {
		if (props.onSearch === undefined) return
		const details = e.currentTarget as HTMLDetailsElement
		if (details.open) {
			details.querySelector('input')?.focus({ preventScroll: true })
		}
	}

	function handleDetailsFocusOut(e: FocusEvent): void {
		const details = e.currentTarget as HTMLDetailsElement
		const next = e.relatedTarget as Node | null
		// `focusout` fires before the browser has finished moving focus. In
		// particular, clicking the create button can report a null relatedTarget
		// while Solid is updating the list. Closing the details element from that
		// event can detach the button that is currently handling the click and
		// cause the dropdown to get stuck in a focus/update loop.
		if (next === null) return
		queueMicrotask(() => {
			if (!details.isConnected) return
			if (!details.contains(next)) details.open = false
		})
	}

	function handleDetailsKeyDown(e: KeyboardEvent): void {
		const details = e.currentTarget as HTMLDetailsElement
		if (e.key === 'Escape') {
			if (!details.open) return
			e.preventDefault()
			e.stopPropagation()
			details.open = false
			details.querySelector('summary')?.focus({ preventScroll: true })
			return
		}
		// Type-to-search: when the summary has focus (e.g. after tabbing into
		// the field), a printable key opens the dropdown and forwards the
		// character to the search input, so no Enter/Space keypress is needed
		// first. Space is left alone so it keeps its native toggle behaviour.
		const target = e.target as HTMLElement | null
		if (target === null || target.closest('summary') === null) return
		if (props.onSearch === undefined) return
		if (e.ctrlKey || e.metaKey || e.altKey) return
		if (e.key.length !== 1 || e.key === ' ') return
		e.preventDefault()
		if (!details.open) details.open = true
		props.onSearch((props.search ?? '') + e.key)
		queueMicrotask(() => details.querySelector('input')?.focus({ preventScroll: true }))
	}

	function handleSearchKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && canCreate()) {
			e.preventDefault()
			createItem((e.currentTarget as HTMLElement).closest('details'))
		}
	}

	function handleItemKeyDown(e: KeyboardEvent): void {
		if (e.key !== 'Enter') return
		e.preventDefault()
		const checkbox = e.currentTarget as HTMLInputElement
		checkbox.click()
	}

	function focusSearchInput(details: HTMLDetailsElement | null): void {
		if (!details) return
		queueMicrotask(() =>
			details
				.querySelector<HTMLInputElement>('.multi-select-filter')
				?.focus({ preventScroll: true }),
		)
	}

	function handleItemToggle(e: Event, id: string): void {
		props.onToggle(id)
		props.onSearch?.('')
		focusSearchInput((e.currentTarget as HTMLElement).closest('details'))
	}

	function createItem(details: HTMLDetailsElement | null): void {
		props.onCreate?.()
		props.onSearch?.('')
		focusSearchInput(details)
	}

	return (
		<details
			class="multi-select"
			onToggle={handleToggle}
			onFocusOut={handleDetailsFocusOut}
			onKeyDown={handleDetailsKeyDown}
		>
			<summary>
				<Show when={selectedItems().length > 0} fallback={<span>{props.summary}</span>}>
					<For each={selectedItems()}>
						{(item) => (
							<span class="multi-select-chip">
								<span>{item.name}</span>
								<button
									type="button"
									class="multi-select-chip-remove"
									aria-label={`Remove ${item.name}`}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
										props.onToggle(item.id)
									}}
								>
									×
								</button>
							</span>
						)}
					</For>
				</Show>
			</summary>
			<Show
				when={props.onSearch !== undefined}
				fallback={
					<div class="multi-select-options">
						<For each={props.items}>
							{(item) => (
								<label class="check-item">
									<input
										type="checkbox"
										checked={props.selectedIds.includes(item.id)}
										onChange={(e) => handleItemToggle(e, item.id)}
									/>
									<span>{item.name}</span>
								</label>
							)}
						</For>
					</div>
				}
			>
				<div class="multi-select-options">
					<ClearableInput
						class="multi-select-filter"
						placeholder="Search or type a new name…"
						value={props.search ?? ''}
						onInput={(e) => props.onSearch?.(e.currentTarget.value)}
						onKeyDown={handleSearchKeyDown}
						aria-label={props.searchLabel ?? 'Search'}
					/>
					<For each={filtered()}>
						{(item) => (
							<label class="check-item">
								<input
									type="checkbox"
									checked={props.selectedIds.includes(item.id)}
									onChange={(e) => handleItemToggle(e, item.id)}
									onKeyDown={handleItemKeyDown}
								/>
								<span>{item.name}</span>
							</label>
						)}
					</For>
					<Show when={canCreate()}>
						<button
							type="button"
							class="create-row"
							onClick={(e) => createItem((e.currentTarget as HTMLElement).closest('details'))}
						>
							+ Create “{trimmedSearch()}”
						</button>
					</Show>
				</div>
			</Show>
		</details>
	)
}

export type CreatableSingleSelectProps = {
	placeholder: string
	clearLabel: string
	options: Array<{ id: string; label: string }>
	value: string
	onSelect: (id: string) => void
	search: string
	onSearch: (v: string) => void
	searchLabel: string
	onCreate: () => void
	createHint?: string
}

/** Filterable single-select with inline create, used for publisher/location. */
export function CreatableSingleSelect(props: CreatableSingleSelectProps) {
	const filtered = createMemo(() => {
		const q = props.search.trim().toLowerCase()
		if (!q) return props.options
		return props.options.filter((option) => option.label.toLowerCase().includes(q))
	})

	const trimmedSearch = createMemo(() => props.search.trim())

	const canCreate = createMemo(
		() =>
			trimmedSearch() !== '' &&
			!props.options.some((option) => option.label.toLowerCase() === trimmedSearch().toLowerCase()),
	)

	const selectedLabel = createMemo(
		() => props.options.find((option) => option.id === props.value)?.label,
	)

	function choose(id: string): void {
		props.onSelect(id)
		props.onSearch('')
	}

	function handleToggle(e: Event): void {
		const details = e.currentTarget as HTMLDetailsElement
		if (details.open) {
			details.querySelector('input')?.focus({ preventScroll: true })
		}
	}

	function handleDetailsFocusOut(e: FocusEvent): void {
		const details = e.currentTarget as HTMLDetailsElement
		const next = e.relatedTarget as Node | null
		// Defer the close until focus has settled. A synchronous close here can
		// race with the click handler for an option/create button and repeatedly
		// open and close the native details control.
		if (next === null) return
		queueMicrotask(() => {
			if (!details.isConnected) return
			if (!details.contains(next)) details.open = false
		})
	}

	function handleDetailsKeyDown(e: KeyboardEvent): void {
		const details = e.currentTarget as HTMLDetailsElement
		if (e.key === 'Escape') {
			if (!details.open) return
			e.preventDefault()
			e.stopPropagation()
			details.open = false
			details.querySelector('summary')?.focus({ preventScroll: true })
			return
		}
		// Type-to-search: when the summary has focus (e.g. after tabbing into
		// the field), a printable key opens the dropdown and forwards the
		// character to the search input, so no Enter/Space keypress is needed
		// first. Space is left alone so it keeps its native toggle behaviour.
		const target = e.target as HTMLElement | null
		if (target === null || target.closest('summary') === null) return
		if (e.ctrlKey || e.metaKey || e.altKey) return
		if (e.key.length !== 1 || e.key === ' ') return
		e.preventDefault()
		if (!details.open) details.open = true
		props.onSearch(props.search + e.key)
		queueMicrotask(() => details.querySelector('input')?.focus({ preventScroll: true }))
	}

	function handleSearchKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Enter' && canCreate()) {
			e.preventDefault()
			props.onCreate()
		}
	}

	return (
		<details
			class="multi-select"
			onToggle={handleToggle}
			onFocusOut={handleDetailsFocusOut}
			onKeyDown={handleDetailsKeyDown}
		>
			<summary>{selectedLabel() ?? props.placeholder}</summary>
			<div class="multi-select-options" role="listbox">
				<ClearableInput
					class="multi-select-filter"
					placeholder="Search or type a new name…"
					value={props.search}
					onInput={(e) => props.onSearch(e.currentTarget.value)}
					onKeyDown={handleSearchKeyDown}
					aria-label={props.searchLabel}
				/>
				<Show when={props.value !== ''}>
					<button type="button" class="select-option" onClick={() => choose('')}>
						{props.clearLabel}
					</button>
				</Show>
				<For each={filtered()}>
					{(option) => (
						<button
							type="button"
							role="option"
							aria-selected={option.id === props.value}
							class="select-option"
							onClick={() => choose(option.id)}
						>
							<Show when={option.id === props.value}>
								<span aria-hidden="true">✓ </span>
							</Show>
							{option.label}
						</button>
					)}
				</For>
				<Show when={canCreate()}>
					<button type="button" class="create-row" onClick={() => props.onCreate()}>
						+ Create “{trimmedSearch()}”<Show when={props.createHint}> ({props.createHint})</Show>
					</button>
				</Show>
			</div>
		</details>
	)
}
