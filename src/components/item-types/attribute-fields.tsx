// The dynamic part of the item form: inputs for a resolved field list, bound to
// a TanStack Form under `name` (default "attributes"), validated per field with
// the same schema the server uses (fieldSchema / prepareAttributes).
//
// Embedding (items form):
//   const form = createForm(() => ({ defaultValues: { name: "", attributes: {} }, onSubmit }));
//   <AttributeFields form={form} fields={activeFields(type.effectiveFields)} searchItems={search} />
// The server re-validates with prepareItemAttributes (src/server/item-types/service.ts).
import { createForm } from '@tanstack/solid-form'
import { createSignal, For, type JSX, Show } from 'solid-js'
import { Button } from '~/components/ui/button'
import {
	activeFields,
	type FieldDefinition,
	isMultiple,
	validateFieldValue,
} from '~/lib/item-types/fields'
import { m } from '~/paraglide/messages'
import { FieldInput, isGroupInput } from './field-input'
import type { ItemSearchFn } from './pickers'

/** Minimal surface of a Solid TanStack Form that AttributeFields needs. */
export type AttributesFormLike = {
	// biome-ignore lint/suspicious/noExplicitAny: field names are dynamic (`attributes.<key>`)
	Field: (props: any) => JSX.Element
}

type FieldApiLike = {
	state: { value: unknown; meta: { errors: unknown[]; isTouched: boolean } }
	handleChange: (v: unknown) => void
	handleBlur: () => void
}

export type AttributeFieldsProps = {
	form: AttributesFormLike
	/** Effective fields of the item's type; hidden ones are skipped. */
	fields: readonly FieldDefinition[]
	/** Path of the attributes object inside the form values. */
	name?: string
	/** Prefix for element ids (several forms on one page). */
	idPrefix?: string
	disabled?: boolean
	searchItems?: ItemSearchFn
	itemName?: (id: string) => string | undefined
	/** ItemDetail.hiddenReferences: per `item` field, how many references the caller cannot see. */
	hiddenReferences?: Record<string, number>
}

const errorText = (e: unknown): string =>
	typeof e === 'string'
		? e
		: e && typeof e === 'object' && 'message' in e
			? String(e.message)
			: ''

export function AttributeFields(props: AttributeFieldsProps) {
	const base = () => props.name ?? 'attributes'
	const idOf = (key: string) => `${props.idPrefix ?? 'attr'}-${key}`
	return (
		<div class="grid gap-4">
			<For each={activeFields(props.fields)}>
				{(field) => (
					<props.form.Field
						name={`${base()}.${field.key}`}
						validators={{
							onChange: ({ value }: { value: unknown }) =>
								validateFieldValue(field, value),
							onSubmit: ({ value }: { value: unknown }) =>
								validateFieldValue(field, value),
						}}
					>
						{(api: () => FieldApiLike) => (
							<FieldRow
								field={field}
								id={idOf(field.key)}
								api={api}
								disabled={props.disabled}
								searchItems={props.searchItems}
								itemName={props.itemName}
								hiddenCount={props.hiddenReferences?.[field.key] ?? 0}
							/>
						)}
					</props.form.Field>
				)}
			</For>
		</div>
	)
}

function FieldRow(props: {
	field: FieldDefinition
	id: string
	api: () => FieldApiLike
	disabled?: boolean
	searchItems?: ItemSearchFn
	itemName?: (id: string) => string | undefined
	hiddenCount?: number
}) {
	const error = () => {
		const meta = props.api().state.meta
		return meta.isTouched ? errorText(meta.errors[0]) : ''
	}
	const helpId = () => `${props.id}-help`
	const errorId = () => `${props.id}-error`
	const hiddenId = () => `${props.id}-hidden`
	const hiddenText = () => {
		const n = props.hiddenCount ?? 0
		if (!n) return ''
		if (isMultiple(props.field)) return m.field_hidden_references_multi({ count: n })
		return props.api().state.value
			? m.field_hidden_reference_replaced()
			: m.field_hidden_reference_single()
	}
	const describedBy = () =>
		[props.field.help ? helpId() : '', hiddenText() ? hiddenId() : '', error() ? errorId() : '']
			.filter(Boolean)
			.join(' ') || undefined
	const required = () => props.field.required === true && props.field.kind !== 'boolean'
	const labelText = () => (
		<>
			{props.field.label}
			<Show when={required()}>
				<span aria-hidden="true" class="text-destructive">
					{' '}
					*
				</span>
				<span class="sr-only"> ({m.field_required_mark()})</span>
			</Show>
		</>
	)
	const input = () => (
		<FieldInput
			field={props.field}
			id={props.id}
			value={props.api().state.value}
			onChange={(v) => props.api().handleChange(v)}
			onBlur={() => props.api().handleBlur()}
			invalid={!!error()}
			describedBy={describedBy()}
			disabled={props.disabled}
			searchItems={props.searchItems}
			itemName={props.itemName}
		/>
	)
	const footer = () => (
		<>
			<Show when={hiddenText()}>
				<p
					id={hiddenId()}
					class="text-sm text-muted-foreground"
					data-testid="hidden-reference"
				>
					{hiddenText()}
				</p>
			</Show>
			<Show when={props.field.help}>
				<p id={helpId()} class="text-sm text-muted-foreground">
					{props.field.help}
				</p>
			</Show>
			<Show when={error()}>
				<p id={errorId()} class="text-sm font-medium text-destructive">
					{error()}
				</p>
			</Show>
		</>
	)
	return (
		<Show
			when={isGroupInput(props.field)}
			fallback={
				<div class="grid gap-2">
					<Show when={props.field.kind !== 'boolean'}>
						<label for={props.id} class="text-sm font-medium">
							{labelText()}
						</label>
					</Show>
					{input()}
					{footer()}
				</div>
			}
		>
			<fieldset class="grid gap-2" aria-describedby={describedBy()}>
				<legend class="mb-2 text-sm font-medium">{labelText()}</legend>
				{input()}
				{footer()}
			</fieldset>
		</Show>
	)
}

/**
 * Standalone form around AttributeFields, e.g. the schema editor's live
 * preview. `onValid` gets the parsed attributes when "check" is pressed.
 */
export function AttributesPreviewForm(props: {
	fields: readonly FieldDefinition[]
	idPrefix?: string
	searchItems?: ItemSearchFn
}) {
	const [ok, setOk] = createSignal(false)
	const form = createForm(() => ({
		defaultValues: { attributes: {} as Record<string, unknown> },
		onSubmit: () => setOk(true),
	}))
	return (
		<form
			class="grid gap-4"
			noValidate
			onSubmit={(e) => {
				e.preventDefault()
				setOk(false)
				void form.handleSubmit()
			}}
		>
			<AttributeFields
				form={form}
				fields={props.fields}
				idPrefix={props.idPrefix ?? 'preview'}
				searchItems={props.searchItems}
			/>
			<div class="flex flex-wrap items-center gap-3">
				<Button type="submit" variant="secondary">
					{m.types_preview_check()}
				</Button>
				<Show when={ok()}>
					<p role="status" class="text-sm text-success">
						{m.types_preview_ok()}
					</p>
				</Show>
			</div>
		</form>
	)
}
