import { type JSX, Show, splitProps } from 'solid-js'

export function ClearableInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
	const [local, inputProps] = splitProps(props, ['value', 'type', 'class', 'classList'])
	let input!: HTMLInputElement
	const value = () => String(local.value ?? '')

	return (
		<span class="clearable-input">
			<input
				{...inputProps}
				type={local.type}
				class={local.class}
				classList={local.classList}
				value={value()}
				ref={input}
			/>
			<Show when={value().length > 0}>
				<button
					type="button"
					class="input-clear"
					aria-label="Clear input"
					title="Clear"
					tabIndex={-1}
					onMouseDown={(e) => e.preventDefault()}
					onClick={(e) => {
						// The button lives inside a <label>: stop the click from
						// activating the labeled control (focus steal, date picker
						// popup) after clearing.
						e.preventDefault()
						e.stopPropagation()
						input.value = ''
						input.dispatchEvent(new InputEvent('input', { bubbles: true }))
						input.focus({ preventScroll: true })
					}}
				>
					×
				</button>
			</Show>
		</span>
	)
}
