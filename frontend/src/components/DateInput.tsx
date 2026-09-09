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
 */
export default function DateInput(props: DateInputProps) {
	return (
		<input
			type="date"
			lang="en-CA" // Ensures Chromium renders ISO date. Others use their default but submit ISO dates.
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
