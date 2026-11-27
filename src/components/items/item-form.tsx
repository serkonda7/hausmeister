// Inputs for an item's base fields (bound to a Solid store of ItemBaseValues)
// and helpers to put server-side attribute errors next to their fields.
// Used by /items/new and /items/$itemId/edit together with <AttributeFields>.
import { type JSX, Show, splitProps } from 'solid-js'
import type { SetStoreFunction } from 'solid-js/store'
import type { AttributesFormLike } from '~/components/item-types/attribute-fields'
import { inputClass } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { cn } from '~/lib/cn'
import type { BaseErrors, ItemBaseValues } from '~/lib/items/form'
import { m } from '~/paraglide/messages'
import { TagInput } from './tag-input'

/** Label, control, optional hint and error, wired with aria-describedby. */
export function FormRow(props: {
	id: string
	label: string
	hint?: string
	error?: string
	required?: boolean
	class?: string
	children: (a: { describedBy?: string; invalid: boolean }) => JSX.Element
}) {
	const hintId = () => `${props.id}-hint`
	const errId = () => `${props.id}-error`
	const describedBy = () =>
		[props.hint ? hintId() : '', props.error ? errId() : ''].filter(Boolean).join(' ') ||
		undefined
	return (
		<div class={cn('grid content-start gap-2', props.class)}>
			<label for={props.id} class="text-sm font-medium">
				{props.label}
				<Show when={props.required}>
					<span aria-hidden="true" class="text-destructive">
						{' '}
						*
					</span>
					<span class="sr-only"> ({m.field_required_mark()})</span>
				</Show>
			</label>
			{props.children({ describedBy: describedBy(), invalid: !!props.error })}
			<Show when={props.hint}>
				<p id={hintId()} class="text-sm text-muted-foreground">
					{props.hint}
				</p>
			</Show>
			<Show when={props.error}>
				<p id={errId()} class="text-sm font-medium text-destructive">
					{props.error}
				</p>
			</Show>
		</div>
	)
}

type TextProps = JSX.InputHTMLAttributes<HTMLInputElement> & {
	invalid?: boolean
	describedBy?: string
}
export function TextInput(props: TextProps) {
	const [local, rest] = splitProps(props, ['invalid', 'describedBy', 'class'])
	return (
		<input
			class={cn(inputClass, local.class)}
			aria-invalid={local.invalid || undefined}
			aria-describedby={local.describedBy}
			{...rest}
		/>
	)
}

export function NameField(props: {
	id: string
	value: string
	onInput: (v: string) => void
	error?: string
	disabled?: boolean
	autofocus?: boolean
}) {
	return (
		<FormRow id={props.id} label={m.item_field_name()} error={props.error} required>
			{(a) => (
				<TextInput
					id={props.id}
					name="name"
					required
					maxLength={200}
					autocomplete="off"
					enterkeyhint="done"
					autofocus={props.autofocus}
					value={props.value}
					disabled={props.disabled}
					onInput={(e) => props.onInput(e.currentTarget.value)}
					invalid={a.invalid}
					describedBy={a.describedBy}
				/>
			)}
		</FormRow>
	)
}

/** Everything but the name. Price only when the caller may see money (edit+). */
export function ItemBaseFields(props: {
	idPrefix: string
	values: ItemBaseValues
	set: SetStoreFunction<ItemBaseValues>
	errors: BaseErrors
	withPrice: boolean
	stock: boolean
	currency?: string
	disabled?: boolean
}) {
	const id = (k: string) => `${props.idPrefix}-${k}`
	const text = (k: Exclude<keyof ItemBaseValues, 'tags'>) => ({
		id: id(k),
		value: props.values[k],
		disabled: props.disabled,
		onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) =>
			props.set(k, e.currentTarget.value),
	})
	return (
		<div class="grid gap-4">
			<FormRow id={id('description')} label={m.item_field_description()}>
				{(a) => (
					<Textarea
						id={id('description')}
						maxLength={5000}
						value={props.values.description}
						disabled={props.disabled}
						aria-describedby={a.describedBy}
						onInput={(e) => props.set('description', e.currentTarget.value)}
					/>
				)}
			</FormRow>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3">
				<FormRow
					id={id('quantity')}
					label={m.item_field_quantity()}
					error={props.errors.quantity}
				>
					{(a) => (
						<TextInput
							{...text('quantity')}
							inputmode="decimal"
							autocomplete="off"
							{...a}
						/>
					)}
				</FormRow>
				<FormRow id={id('unit')} label={m.item_field_unit()} hint={m.item_unit_hint()}>
					{(a) => (
						<TextInput {...text('unit')} maxLength={20} autocomplete="off" {...a} />
					)}
				</FormRow>
				<Show when={props.stock || props.values.minQuantity}>
					<FormRow
						id={id('minQuantity')}
						label={m.item_field_min_quantity()}
						error={props.errors.minQuantity}
						hint={m.item_min_quantity_hint()}
					>
						{(a) => (
							<TextInput
								{...text('minQuantity')}
								inputmode="decimal"
								autocomplete="off"
								{...a}
							/>
						)}
					</FormRow>
				</Show>
			</div>
			<div class="grid gap-4 sm:grid-cols-2">
				<FormRow id={id('condition')} label={m.item_field_condition()}>
					{(a) => <TextInput {...text('condition')} maxLength={200} {...a} />}
				</FormRow>
				<FormRow
					id={id('acquiredOn')}
					label={m.item_field_acquired_on()}
					error={props.errors.acquiredOn}
				>
					{(a) => <TextInput {...text('acquiredOn')} type="date" {...a} />}
				</FormRow>
				<Show when={props.withPrice}>
					<FormRow
						id={id('price')}
						label={m.item_field_price_in({ currency: props.currency ?? 'EUR' })}
						hint={m.item_price_hint()}
						error={props.errors.price}
					>
						{(a) => (
							<TextInput
								{...text('price')}
								inputmode="decimal"
								autocomplete="off"
								{...a}
							/>
						)}
					</FormRow>
				</Show>
				<FormRow id={id('barcode')} label={m.item_field_barcode()}>
					{(a) => (
						<TextInput
							{...text('barcode')}
							maxLength={64}
							autocomplete="off"
							inputmode="text"
							{...a}
						/>
					)}
				</FormRow>
			</div>
			<div class="grid gap-2">
				<label for={id('tags')} class="text-sm font-medium">
					{m.item_field_tags()}
				</label>
				<TagInput
					id={id('tags')}
					value={props.values.tags}
					onChange={(t) => props.set('tags', t)}
					disabled={props.disabled}
				/>
			</div>
		</div>
	)
}

type FormWithMeta = AttributesFormLike & {
	setFieldMeta: (name: never, updater: (meta: never) => unknown) => void
}

/**
 * Shows ATTRIBUTES_INVALID field errors from the server next to their
 * fields (as submit errors) and focuses the first one.
 */
export function applyAttributeErrors(
	form: unknown,
	errors: Record<string, string>,
	opts: { name?: string; idPrefix?: string } = {},
) {
	const f = form as FormWithMeta
	const base = opts.name ?? 'attributes'
	const keys = Object.keys(errors)
	for (const key of keys) {
		f.setFieldMeta(
			`${base}.${key}` as never,
			((meta: Record<string, unknown>) => ({
				...meta,
				isTouched: true,
				errorMap: { ...((meta?.errorMap as object) ?? {}), onSubmit: errors[key] },
			})) as never,
		)
	}
	const first = keys[0]
	if (first && typeof document !== 'undefined')
		queueMicrotask(() =>
			document.getElementById(`${opts.idPrefix ?? 'attr'}-${first}`)?.focus(),
		)
}

/** Focuses the first base field with an error. */
export function focusFirstError(idPrefix: string, errors: BaseErrors) {
	const first = Object.keys(errors)[0]
	if (first && typeof document !== 'undefined')
		queueMicrotask(() => document.getElementById(`${idPrefix}-${first}`)?.focus())
}
