// Tag names as removable chips plus a text box with suggestions from the
// existing tags. Enter or comma adds; unknown names create the tag on save.
import { useQuery } from '@tanstack/solid-query'
import { createSignal, For, Show } from 'solid-js'
import { Button } from '~/components/ui/button'
import { inputClass } from '~/components/ui/input'
import { TAG_NAME_MAX } from '~/lib/items/constants'
import { tagsQuery } from '~/lib/items/queries'
import { m } from '~/paraglide/messages'

export function TagInput(props: {
	id: string
	value: string[]
	onChange: (tags: string[]) => void
	disabled?: boolean
}) {
	const tags = useQuery(() => tagsQuery())
	const [text, setText] = createSignal('')
	const listId = () => `${props.id}-suggestions`
	const has = (name: string) =>
		props.value.some((t) => t.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))

	function commit() {
		const names = text()
			.split(',')
			.map((s) => s.trim().slice(0, TAG_NAME_MAX))
			.filter(Boolean)
		const next = [...props.value]
		for (const n of names)
			if (!next.some((t) => t.toLowerCase() === n.toLowerCase())) next.push(n)
		if (next.length !== props.value.length) props.onChange(next.slice(0, 30))
		setText('')
	}

	return (
		<div class="grid gap-2">
			<Show when={props.value.length}>
				<ul class="flex flex-wrap gap-2" aria-label={m.item_field_tags()}>
					<For each={props.value}>
						{(t) => (
							<li class="inline-flex items-center gap-1 rounded-full border bg-secondary py-1 pl-3 pr-1 text-sm">
								{t}
								<button
									type="button"
									class="flex size-8 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-label={m.item_tag_remove({ name: t })}
									disabled={props.disabled}
									onClick={() =>
										props.onChange(props.value.filter((x) => x !== t))
									}
								>
									✕
								</button>
							</li>
						)}
					</For>
				</ul>
			</Show>
			<div class="flex gap-2">
				<input
					id={props.id}
					class={inputClass}
					list={listId()}
					autocomplete="off"
					maxLength={TAG_NAME_MAX * 3}
					enterkeyhint="done"
					placeholder={m.item_tag_placeholder()}
					disabled={props.disabled}
					value={text()}
					onInput={(e) => {
						const v = e.currentTarget.value
						setText(v)
						if (v.endsWith(',')) commit()
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault()
							commit()
						}
					}}
					onBlur={() => text().trim() && commit()}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={props.disabled || !text().trim()}
					onClick={commit}
				>
					{m.item_tag_add()}
				</Button>
			</div>
			<datalist id={listId()}>
				<For each={(tags.data ?? []).filter((t) => !has(t.name))}>
					{(t) => <option value={t.name} />}
				</For>
			</datalist>
		</div>
	)
}
