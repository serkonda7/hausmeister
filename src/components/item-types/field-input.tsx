// One input per field kind. Inputs emit values in the stored shape (see
// src/lib/item-types/fields.ts); text that isn't a valid number is passed on as
// the raw string so the schema reports a German error instead of losing input.
import { createEffect, createSignal, For, type JSX, Match, Show, Switch } from 'solid-js'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import { inputClass } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/cn'
import { parseDecimalDe } from '~/lib/format'
import { formatSizeValue, sizeSystemLabel } from '~/lib/item-types/display'
import {
	type FieldDefinition,
	type FieldOf,
	isMultiple,
	SIZE_VALUES,
	type SizeSystem,
} from '~/lib/item-types/fields'
import { m } from '~/paraglide/messages'
import { ItemPicker, type ItemSearchFn, searchItemsStub, UserPicker } from './pickers'

export type FieldInputProps = {
	field: FieldDefinition
	id: string
	value: unknown
	onChange: (v: unknown) => void
	onBlur: () => void
	invalid: boolean
	describedBy?: string
	disabled?: boolean
	searchItems?: ItemSearchFn
	itemName?: (id: string) => string | undefined
}

/** Kinds rendered as a group (fieldset + legend) instead of label + single control. */
export function isGroupInput(f: FieldDefinition): boolean {
	return (
		f.kind === 'multiselect' ||
		f.kind === 'measure' ||
		f.kind === 'size' ||
		(f.kind === 'user' && f.multiple === true) ||
		(isMultiple(f) && (f.kind === 'text' || f.kind === 'url' || f.kind === 'barcode'))
	)
}

const numberText = (v: unknown) =>
	typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'string' ? v : ''

/** Text box for numbers in German notation ("1,5"); keeps what the user typed. */
function NumberInput(props: {
	id: string
	value: unknown
	onChange: (v: unknown) => void
	onBlur: () => void
	integer?: boolean
	invalid: boolean
	describedBy?: string
	disabled?: boolean
	class?: string
	ariaLabel?: string
}) {
	const [text, setText] = createSignal(numberText(props.value))
	createEffect(() => {
		const v = props.value
		const parsed = parseDecimalDe(text())
		if (v === undefined ? text().trim() !== '' : parsed !== v && text() !== v)
			setText(numberText(v))
	})
	return (
		<input
			id={props.id}
			type="text"
			inputmode={props.integer ? 'numeric' : 'decimal'}
			autocomplete="off"
			class={cn(inputClass, props.class)}
			aria-label={props.ariaLabel}
			aria-describedby={props.describedBy}
			aria-invalid={props.invalid || undefined}
			disabled={props.disabled}
			value={text()}
			onInput={(e) => {
				const t = e.currentTarget.value
				setText(t)
				if (t.trim() === '') return props.onChange(undefined)
				const n = parseDecimalDe(t)
				props.onChange(n === null ? t : n)
			}}
			onBlur={() => props.onBlur()}
		/>
	)
}

function TextList(props: FieldInputProps & { type: 'text' | 'url' }) {
	const list = () => {
		const v = Array.isArray(props.value) ? (props.value as unknown[]).map(String) : []
		return v.length ? v : ['']
	}
	const set = (i: number, s: string) => {
		const next = [...list()]
		next[i] = s
		props.onChange(next)
	}
	return (
		<div class="grid gap-2">
			<For each={list()}>
				{(v, i) => (
					<div class="flex gap-2">
						<input
							id={i() === 0 ? props.id : `${props.id}-${i()}`}
							type={props.type}
							class={inputClass}
							aria-label={`${props.field.label} ${i() + 1}`}
							aria-describedby={props.describedBy}
							aria-invalid={props.invalid || undefined}
							disabled={props.disabled}
							value={v}
							onInput={(e) => set(i(), e.currentTarget.value)}
							onBlur={() => props.onBlur()}
						/>
						<Show when={list().length > 1}>
							<Button
								variant="ghost"
								size="icon"
								aria-label={m.field_remove_value({ n: String(i() + 1) })}
								disabled={props.disabled}
								onClick={() => props.onChange(list().filter((_, j) => j !== i()))}
							>
								✕
							</Button>
						</Show>
					</div>
				)}
			</For>
			<div>
				<Button
					variant="outline"
					size="sm"
					disabled={props.disabled}
					onClick={() => props.onChange([...list(), ''])}
				>
					+ {m.field_add_value()}
				</Button>
			</div>
		</div>
	)
}

function OptionSelect(props: {
	id: string
	options: readonly { value: string; label: string }[]
	value: string
	onChange: (v: string | undefined) => void
	onBlur: () => void
	invalid?: boolean
	describedBy?: string
	disabled?: boolean
	ariaLabel?: string
	placeholder?: boolean
	class?: string
}) {
	return (
		<select
			id={props.id}
			class={cn(inputClass, props.class)}
			aria-label={props.ariaLabel}
			aria-describedby={props.describedBy}
			aria-invalid={props.invalid || undefined}
			disabled={props.disabled}
			value={props.value}
			onChange={(e) => props.onChange(e.currentTarget.value || undefined)}
			onBlur={() => props.onBlur()}
		>
			<Show when={props.placeholder !== false}>
				<option value="" selected={!props.value}>
					{m.field_select_placeholder()}
				</option>
			</Show>
			<Show when={props.value && !props.options.some((o) => o.value === props.value)}>
				<option value={props.value} selected>
					{props.value}
				</option>
			</Show>
			<For each={props.options}>
				{(o) => (
					<option value={o.value} selected={o.value === props.value}>
						{o.label}
					</option>
				)}
			</For>
		</select>
	)
}

function MeasureInput(props: FieldInputProps & { field: FieldOf<'measure'> }) {
	const cur = () => (props.value ?? {}) as { value?: unknown; unit?: string }
	const unit = () => cur().unit ?? props.field.units[0]
	const emit = (value: unknown, u: string | undefined) =>
		props.onChange(value === undefined ? undefined : { value, unit: u })
	return (
		<div class="flex gap-2">
			<NumberInput
				id={props.id}
				value={cur().value}
				onChange={(v) => emit(v, unit())}
				onBlur={props.onBlur}
				invalid={props.invalid}
				describedBy={props.describedBy}
				disabled={props.disabled}
				ariaLabel={props.field.label}
				class="flex-1"
			/>
			<Show
				when={props.field.units.length > 1}
				fallback={
					<span class="flex h-11 items-center px-2 text-base text-muted-foreground">
						{unit()}
					</span>
				}
			>
				<OptionSelect
					id={`${props.id}-unit`}
					ariaLabel={m.field_unit()}
					class="w-28"
					placeholder={false}
					options={props.field.units.map((u) => ({ value: u, label: u }))}
					value={unit() ?? ''}
					onChange={(u) => emit(cur().value, u)}
					onBlur={props.onBlur}
					disabled={props.disabled}
				/>
			</Show>
		</div>
	)
}

function SizeInput(props: FieldInputProps & { field: FieldOf<'size'> }) {
	const cur = () => (props.value ?? {}) as { system?: SizeSystem; value?: string }
	const system = () => cur().system ?? props.field.systems[0]!
	return (
		<div class="flex flex-wrap gap-2">
			<Show when={props.field.systems.length > 1}>
				<OptionSelect
					id={`${props.id}-system`}
					ariaLabel={m.field_size_system()}
					class="min-w-0 flex-1 basis-48"
					placeholder={false}
					options={props.field.systems.map((s) => ({
						value: s,
						label: sizeSystemLabel(s),
					}))}
					value={system()}
					onChange={(s) =>
						props.onChange(cur().value ? { system: s, value: '' } : undefined)
					}
					onBlur={props.onBlur}
					disabled={props.disabled}
				/>
			</Show>
			<OptionSelect
				id={props.id}
				ariaLabel={m.field_size_value()}
				class="min-w-0 flex-1 basis-28"
				options={(SIZE_VALUES[system()] ?? []).map((v) => ({
					value: v,
					label: formatSizeValue(v),
				}))}
				value={cur().value ?? ''}
				onChange={(v) => props.onChange(v ? { system: system(), value: v } : undefined)}
				onBlur={props.onBlur}
				invalid={props.invalid}
				describedBy={props.describedBy}
				disabled={props.disabled}
			/>
		</div>
	)
}

function ColorInput(props: FieldInputProps) {
	const hex = () => (typeof props.value === 'string' ? props.value : '')
	return (
		<div class="flex items-center gap-3">
			<input
				id={props.id}
				type="color"
				class="h-11 w-16 cursor-pointer rounded-md border border-input bg-background p-1"
				aria-describedby={props.describedBy}
				aria-invalid={props.invalid || undefined}
				disabled={props.disabled}
				value={hex() || '#000000'}
				onInput={(e) => props.onChange(e.currentTarget.value)}
				onBlur={() => props.onBlur()}
			/>
			<span class="text-sm text-muted-foreground">{hex() || m.field_color_none()}</span>
			<Show when={hex()}>
				<Button
					variant="ghost"
					size="sm"
					disabled={props.disabled}
					onClick={() => props.onChange(undefined)}
				>
					{m.field_color_clear()}
				</Button>
			</Show>
		</div>
	)
}

/** The control(s) for one field, without label and error text (see AttributeFields). */
export function FieldInput(props: FieldInputProps): JSX.Element {
	const common = () => ({
		id: props.id,
		'aria-describedby': props.describedBy,
		'aria-invalid': props.invalid || undefined,
		disabled: props.disabled,
		onBlur: () => props.onBlur(),
	})
	const str = () => (typeof props.value === 'string' ? props.value : '')
	const f = props.field
	return (
		<Switch>
			<Match when={f.kind === 'text' && isMultiple(f)}>
				<TextList {...props} type="text" />
			</Match>
			<Match when={f.kind === 'url' && isMultiple(f)}>
				<TextList {...props} type="url" />
			</Match>
			<Match when={f.kind === 'barcode' && isMultiple(f)}>
				<TextList {...props} type="text" />
			</Match>
			<Match
				when={
					f.kind === 'text' ||
					f.kind === 'barcode' ||
					f.kind === 'isbn' ||
					f.kind === 'url'
				}
			>
				<input
					{...common()}
					type={f.kind === 'url' ? 'url' : 'text'}
					inputmode={f.kind === 'isbn' ? 'numeric' : undefined}
					autocapitalize={f.kind === 'text' ? undefined : 'none'}
					class={inputClass}
					value={str()}
					onInput={(e) => props.onChange(e.currentTarget.value)}
				/>
			</Match>
			<Match when={f.kind === 'longtext'}>
				<Textarea
					{...common()}
					value={str()}
					onInput={(e) => props.onChange(e.currentTarget.value)}
				/>
			</Match>
			<Match when={f.kind === 'integer' || f.kind === 'decimal'}>
				<div class="flex items-center gap-2">
					<NumberInput
						id={props.id}
						value={props.value}
						onChange={props.onChange}
						onBlur={props.onBlur}
						integer={f.kind === 'integer'}
						invalid={props.invalid}
						describedBy={props.describedBy}
						disabled={props.disabled}
					/>
					<Show when={(f as FieldOf<'decimal'>).unit}>
						<span class="text-base text-muted-foreground">
							{(f as FieldOf<'decimal'>).unit}
						</span>
					</Show>
				</div>
			</Match>
			<Match when={f.kind === 'measure'}>
				<MeasureInput {...props} field={f as FieldOf<'measure'>} />
			</Match>
			<Match when={f.kind === 'boolean'}>
				<Checkbox
					id={props.id}
					class="min-h-11"
					label={f.label}
					disabled={props.disabled}
					checked={props.value === true}
					onChange={(on: boolean) => {
						props.onChange(on)
						props.onBlur()
					}}
					aria-describedby={props.describedBy}
				/>
			</Match>
			<Match when={f.kind === 'date'}>
				<input
					{...common()}
					type="date"
					class={inputClass}
					min={(f as FieldOf<'date'>).min}
					max={(f as FieldOf<'date'>).max}
					value={str()}
					onInput={(e) => props.onChange(e.currentTarget.value || undefined)}
				/>
			</Match>
			<Match when={f.kind === 'select'}>
				<OptionSelect
					id={props.id}
					options={(f as FieldOf<'select'>).options.map((o) => ({ value: o, label: o }))}
					value={str()}
					onChange={props.onChange}
					onBlur={props.onBlur}
					invalid={props.invalid}
					describedBy={props.describedBy}
					disabled={props.disabled}
				/>
			</Match>
			<Match when={f.kind === 'multiselect'}>
				<div class="grid gap-1 sm:grid-cols-2" id={props.id}>
					<For each={(f as FieldOf<'multiselect'>).options}>
						{(o) => {
							const sel = () =>
								Array.isArray(props.value) ? (props.value as string[]) : []
							return (
								<Checkbox
									class="min-h-11"
									label={o}
									disabled={props.disabled}
									checked={sel().includes(o)}
									onChange={(on: boolean) => {
										const next = on
											? [...sel(), o]
											: sel().filter((x) => x !== o)
										props.onChange(next.length ? next : undefined)
										props.onBlur()
									}}
								/>
							)
						}}
					</For>
				</div>
			</Match>
			<Match when={f.kind === 'color'}>
				<ColorInput {...props} />
			</Match>
			<Match when={f.kind === 'size'}>
				<SizeInput {...props} field={f as FieldOf<'size'>} />
			</Match>
			<Match when={f.kind === 'user'}>
				<UserPicker
					id={props.id}
					label={f.label}
					multiple={isMultiple(f)}
					value={props.value}
					onChange={props.onChange}
					onBlur={props.onBlur}
					invalid={props.invalid}
					describedBy={props.describedBy}
					disabled={props.disabled}
				/>
			</Match>
			<Match when={f.kind === 'item'}>
				<ItemPicker
					id={props.id}
					label={f.label}
					multiple={isMultiple(f)}
					value={props.value}
					onChange={props.onChange}
					onBlur={props.onBlur}
					invalid={props.invalid}
					describedBy={props.describedBy}
					disabled={props.disabled}
					search={props.searchItems ?? searchItemsStub}
					itemName={props.itemName}
				/>
			</Match>
		</Switch>
	)
}
