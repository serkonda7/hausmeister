// Type choice for quick add: one big radio card per active type (subtypes
// indented under their parent), phone-friendly and keyboard operable.
import { createMemo, For } from 'solid-js'
import { cn } from '~/lib/cn'
import { typeIconGlyph } from '~/lib/item-types/icons'
import { flattenTree, type TreeNode } from '~/lib/item-types/tree'
import { m } from '~/paraglide/messages'

type TypeLike = { id: string; parentId: string | null; name: string; icon: string | null }

export function TypeChoice(props: {
	name: string
	types: readonly TreeNode<TypeLike>[]
	value: string | null
	onChange: (id: string) => void
	error?: string
	disabled?: boolean
}) {
	const flat = createMemo(() => flattenTree(props.types))
	return (
		<fieldset
			class="grid gap-2"
			aria-describedby={props.error ? `${props.name}-error` : undefined}
		>
			<legend class="mb-1 text-sm font-medium">
				{m.item_field_type()}
				<span aria-hidden="true" class="text-destructive">
					{' '}
					*
				</span>
				<span class="sr-only"> ({m.field_required_mark()})</span>
			</legend>
			<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				<For each={flat()}>
					{(t) => (
						<label
							class={cn(
								'flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:checked]:font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
								t.depth > 0 && 'border-dashed',
							)}
						>
							<input
								type="radio"
								name={props.name}
								value={t.id}
								class="sr-only"
								checked={props.value === t.id}
								disabled={props.disabled}
								onChange={() => props.onChange(t.id)}
							/>
							<span aria-hidden="true" class="text-xl leading-none">
								{typeIconGlyph(t.icon)}
							</span>
							<span class="min-w-0 hyphens-auto break-words">{t.name}</span>
						</label>
					)}
				</For>
			</div>
			<p id={`${props.name}-error`} class="text-sm font-medium text-destructive empty:hidden">
				{props.error ?? ''}
			</p>
		</fieldset>
	)
}
