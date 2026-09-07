type DateInputProps = {
	value: string
	onInput?: (value: string) => void
	required?: boolean
	class?: string
	id?: string
	name?: string
	'aria-label'?: string
}

/**
 * Native date picker that displays/edits ISO dates (YYYY-MM-DD).
 *
 * The `value` is always an ISO date string (`YYYY-MM-DD` or `''`),
 * matching the backend contract. `lang="en-CA"` makes Chromium-based
 * browsers render the native control in `YYYY-MM-DD` order instead of
 * the OS locale order (e.g. `MM/DD/YYYY`), while keeping the calendar
 * popup. Non-Chromium browsers fall back to their default rendering,
 * but the submitted value stays ISO.
 */
export default function DateInput(props: DateInputProps) {
	return (
		<input
			type="date"
			lang="en-CA"
			id={props.id}
			value={props.value}
			onInput={(e) => props.onInput?.(e.currentTarget.value)}
			required={props.required}
			class={props.class ?? 'input'}
			name={props.name}
			aria-label={props['aria-label']}
		/>
	)
}
