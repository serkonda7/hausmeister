import { createMemo, createSignal, For, type JSX, onCleanup, onMount, Show } from 'solid-js'
import { t } from '../i18n'
import { ClearableInput } from './ClearableInput'

export type DropdownOption = { id: string; label: string }

type DropdownProps = {
	summary: JSX.Element
	options: DropdownOption[]
	searchLabel: string
	/** Offered when the search matches no option exactly. */
	onCreate: (name: string) => void
	createHint?: string
	role?: 'listbox'
	/** Rendered above the options, e.g. a "none" choice. */
	header?: JSX.Element
	/** `done` clears the search; with `refocus` the search input keeps focus. */
	renderOption: (option: DropdownOption, done: (refocus: boolean) => void) => JSX.Element
}

/** Searchable <details> dropdown with inline create; base of the book form selects. */
function Dropdown(props: DropdownProps) {
	let details!: HTMLDetailsElement
	const [search, setSearch] = createSignal('')
	const query = () => search().trim()
	const matches = (label: string) => label.toLowerCase().includes(query().toLowerCase())
	const filtered = createMemo(() => props.options.filter((o) => matches(o.label)))
	const canCreate = createMemo(
		() =>
			query() !== '' && !props.options.some((o) => o.label.toLowerCase() === query().toLowerCase()),
	)

	const searchInput = () => details.querySelector<HTMLInputElement>('.multi-select-filter')

	function done(refocus: boolean): void {
		setSearch('')
		if (refocus) queueMicrotask(() => searchInput()?.focus({ preventScroll: true }))
	}

	function create(): void {
		props.onCreate(query())
		done(true)
	}

	onMount(() => {
		const closeOnOutsideClick = (e: MouseEvent) => {
			if (!(e.target instanceof Node) || !details.contains(e.target)) details.open = false
		}
		document.addEventListener('click', closeOnOutsideClick)
		onCleanup(() => document.removeEventListener('click', closeOnOutsideClick))
	})

	function onFocusOut(e: FocusEvent): void {
		const next = e.relatedTarget as Node | null
		// `focusout` fires before the browser has finished moving focus. In
		// particular, clicking the create button can report a null relatedTarget
		// while Solid is updating the list. Closing the details element from that
		// event can detach the button that is currently handling the click and
		// cause the dropdown to get stuck in a focus/update loop.
		if (next === null) return
		queueMicrotask(() => {
			if (details.isConnected && !details.contains(next)) details.open = false
		})
	}

	function onKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Escape' && details.open) {
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
		const onSummary = (e.target as HTMLElement | null)?.closest('summary')
		if (!onSummary || e.ctrlKey || e.metaKey || e.altKey) return
		if (e.key.length !== 1 || e.key === ' ') return
		e.preventDefault()
		details.open = true
		setSearch(search() + e.key)
		queueMicrotask(() => searchInput()?.focus({ preventScroll: true }))
	}

	function onSearchKeyDown(e: KeyboardEvent): void {
		// Ctrl/Cmd+Enter is the form-wide "Save" shortcut: let it bubble to
		// the form instead of creating an inline entry.
		if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || !canCreate()) return
		e.preventDefault()
		e.stopPropagation()
		create()
	}

	return (
		<details
			ref={details}
			class="multi-select"
			onToggle={() => details.open && searchInput()?.focus({ preventScroll: true })}
			onFocusOut={onFocusOut}
			onKeyDown={onKeyDown}
		>
			<summary>{props.summary}</summary>
			<div class="multi-select-options" role={props.role}>
				<ClearableInput
					class="multi-select-filter"
					placeholder={t('form.searchOrCreate')}
					value={search()}
					onInput={(e) => setSearch(e.currentTarget.value)}
					onKeyDown={onSearchKeyDown}
					aria-label={props.searchLabel}
				/>
				{props.header}
				<For each={filtered()}>{(option) => props.renderOption(option, done)}</For>
				<Show when={canCreate()}>
					<button type="button" class="create-row" onClick={create}>
						{t('form.create', { name: query() })}
						<Show when={props.createHint}> ({props.createHint})</Show>
					</button>
				</Show>
			</div>
		</details>
	)
}

export type MultiSelectProps = {
	emptySummary: string
	items: Array<{ id: string; name: string }>
	selectedIds: string[]
	onToggle: (id: string) => void
	searchLabel: string
	onCreate: (name: string) => void
}

/** Checkbox list with removable chips, used for authors/tags/languages. */
export function MultiSelect(props: MultiSelectProps) {
	const isSelected = (id: string) => props.selectedIds.includes(id)
	const selectedItems = createMemo(() => props.items.filter((item) => isSelected(item.id)))
	const options = createMemo(() => props.items.map((item) => ({ id: item.id, label: item.name })))

	function removeChip(e: MouseEvent, id: string): void {
		e.preventDefault()
		e.stopPropagation()
		props.onToggle(id)
	}

	// Enter toggles a focused checkbox instead of submitting the form.
	function onCheckboxKeyDown(e: KeyboardEvent): void {
		if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return
		e.preventDefault()
		e.stopPropagation()
		;(e.currentTarget as HTMLInputElement).click()
	}

	const summary = (
		<Show when={selectedItems().length > 0} fallback={<span>{props.emptySummary}</span>}>
			<For each={selectedItems()}>
				{(item) => (
					<span class="multi-select-chip">
						<span>{item.name}</span>
						<button
							type="button"
							class="multi-select-chip-remove"
							aria-label={t('common.remove', { name: item.name })}
							onClick={(e) => removeChip(e, item.id)}
						>
							×
						</button>
					</span>
				)}
			</For>
		</Show>
	)

	return (
		<Dropdown
			summary={summary}
			options={options()}
			searchLabel={props.searchLabel}
			onCreate={props.onCreate}
			renderOption={(option, done) => (
				<label class="check-item">
					<input
						type="checkbox"
						checked={isSelected(option.id)}
						onChange={() => {
							props.onToggle(option.id)
							done(true)
						}}
						onKeyDown={onCheckboxKeyDown}
					/>
					<span>{option.label}</span>
				</label>
			)}
		/>
	)
}

export type SingleSelectProps = {
	/** Shown when nothing is selected, and as the "clear" choice. */
	noneLabel: string
	options: DropdownOption[]
	value: string
	onSelect: (id: string) => void
	searchLabel: string
	onCreate: (name: string) => void
	createHint?: string
}

/** Filterable single-select with inline create, used for publisher/location. */
export function SingleSelect(props: SingleSelectProps) {
	const selectedLabel = () => props.options.find((o) => o.id === props.value)?.label
	const clearChoice = (
		<Show when={props.value !== ''}>
			<button type="button" class="select-option" onClick={() => props.onSelect('')}>
				{props.noneLabel}
			</button>
		</Show>
	)

	return (
		<Dropdown
			summary={selectedLabel() ?? props.noneLabel}
			options={props.options}
			searchLabel={props.searchLabel}
			onCreate={props.onCreate}
			createHint={props.createHint}
			role="listbox"
			header={clearChoice}
			renderOption={(option, done) => (
				<button
					type="button"
					role="option"
					aria-selected={option.id === props.value}
					class="select-option"
					onClick={() => {
						props.onSelect(option.id)
						done(false)
					}}
				>
					<Show when={option.id === props.value}>
						<span aria-hidden="true">✓ </span>
					</Show>
					{option.label}
				</button>
			)}
		/>
	)
}
