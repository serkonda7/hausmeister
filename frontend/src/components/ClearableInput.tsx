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
					tabIndex={-1}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => {
						input.value = ''
						input.dispatchEvent(new Event('input', { bubbles: true }))
					}}
				>
					×
				</button>
			</Show>
		</span>
	)
}
