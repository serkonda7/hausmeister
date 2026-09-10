import type { JSX } from 'solid-js'

interface FieldProps {
	/** Label content rendered inside `.field-label` (with `*` when required). */
	label?: JSX.Element
	required?: boolean
	/** Matches `<label for>` to the inner input `id`. */
	for?: string
	/** Checkbox layout (`.field--checkbox`, no `.field-label` wrapper). */
	checkbox?: boolean
	children: JSX.Element
}

/**
 * Shared form-field shell: `<label class="field">` + `.field-label` +
 * required `*` marker. Children keep their own input/select (use
 * `TextField` / `SelectField` for the fully-wired shortcuts).
 */
export default function Field(props: FieldProps): JSX.Element {
	if (props.checkbox) {
		return (
			// biome-ignore lint/a11y/noLabelWithoutControl: input arrives via `children` and renders inside the label (implicit association).
			<label class="field field--checkbox">
				{props.children}
				{props.label}
			</label>
		)
	}
	return (
		<label class="field" for={props.for}>
			<ShowLabel label={props.label} required={props.required} />
			{props.children}
		</label>
	)
}

function ShowLabel(props: { label?: JSX.Element; required?: boolean }): JSX.Element | null {
	if (props.label == null) {
		return null
	}
	return (
		<span class="field-label">
			{props.label}{' '}
			{props.required ? (
				<span class="req" aria-hidden="true">
					*
				</span>
			) : null}
		</span>
	)
}

interface TextFieldProps {
	label?: JSX.Element
	required?: boolean
	value: string | number
	onInput: (value: string) => void
	type?: string
	step?: string
	min?: string
	max?: string
	placeholder?: string
	disabled?: boolean
	id?: string
	list?: string
	autocomplete?: string
	title?: string
	ariaLabel?: string
	ariaDescribedBy?: string
}

export function TextField(props: TextFieldProps): JSX.Element {
	return (
		<Field label={props.label} required={props.required} for={props.id}>
			<input
				type={props.type}
				step={props.step}
				min={props.min}
				max={props.max}
				value={props.value}
				onInput={(e) => props.onInput(e.currentTarget.value)}
				required={props.required}
				aria-required={props.required || undefined}
				placeholder={props.placeholder}
				disabled={props.disabled}
				id={props.id}
				list={props.list}
				autocomplete={props.autocomplete}
				title={props.title}
				aria-label={props.ariaLabel}
				aria-describedby={props.ariaDescribedBy}
				class="input"
			/>
		</Field>
	)
}

interface SelectFieldProps {
	label?: JSX.Element
	required?: boolean
	value: string
	onChange: (value: string) => void
	children: JSX.Element
	disabled?: boolean
	id?: string
	title?: string
	ariaLabel?: string
	ariaDescribedBy?: string
}

export function SelectField(props: SelectFieldProps): JSX.Element {
	return (
		<Field label={props.label} required={props.required} for={props.id}>
			<select
				value={props.value}
				onChange={(e) => props.onChange(e.currentTarget.value)}
				required={props.required}
				aria-required={props.required || undefined}
				disabled={props.disabled}
				id={props.id}
				title={props.title}
				aria-label={props.ariaLabel}
				aria-describedby={props.ariaDescribedBy}
				class="input"
			>
				{props.children}
			</select>
		</Field>
	)
}
