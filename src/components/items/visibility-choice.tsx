// Household / private choice with the plain sentence from DESIGN §3.3.
// Household-owned items cannot be private (HOUSEHOLD_PRIVATE).
import { Show } from 'solid-js'
import { m } from '~/paraglide/messages'

export function VisibilityChoice(props: {
	name: string
	value: 'household' | 'private'
	onChange: (v: 'household' | 'private') => void
	householdOwned: boolean
	disabled?: boolean
}) {
	const opt = (v: 'household' | 'private', label: string) => (
		<label class="flex min-h-11 items-start gap-2 py-1">
			<input
				type="radio"
				name={props.name}
				value={v}
				class="mt-1 size-4 shrink-0 accent-primary"
				checked={props.value === v}
				disabled={props.disabled || (v === 'private' && props.householdOwned)}
				onChange={() => props.onChange(v)}
			/>
			<span class="text-sm">{label}</span>
		</label>
	)
	return (
		<fieldset class="grid content-start gap-1">
			<legend class="mb-1 text-sm font-medium">{m.item_field_visibility()}</legend>
			{opt('household', m.items_visibility_household())}
			{opt('private', m.items_visibility_private())}
			<Show when={props.householdOwned}>
				<p class="text-sm text-muted-foreground">{m.item_visibility_household_hint()}</p>
			</Show>
		</fieldset>
	)
}
