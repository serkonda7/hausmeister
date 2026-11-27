// Read-only display of an item's attributes, with legacy values under "Alte Felder".
// A warranty field (src/lib/warranty.ts) says when the warranty is about to end or has ended.
import { For, Show } from 'solid-js'
import { Badge } from '~/components/ui/badge'
import { isoDayInBerlin } from '~/lib/format'
import { formatAttributeValue, formatUnknown, splitAttributes } from '~/lib/item-types/display'
import { type FieldDefinition, isMultiple } from '~/lib/item-types/fields'
import { warrantyState } from '~/lib/warranty'
import { m } from '~/paraglide/messages'
import { usePickerUsers } from './pickers'

const HIDDEN_MARK = '\u0000hidden:'

export function AttributeList(props: {
	/** Effective fields of the item's type (hidden ones included, for legacy labels). */
	fields: readonly FieldDefinition[]
	attributes: Record<string, unknown>
	userName?: (id: string) => string | undefined
	itemName?: (id: string) => string | undefined
	/** Hide the "Alte Felder" section (e.g. in compact cards). */
	hideLegacy?: boolean
	/** ItemDetail.hiddenReferences: shown as "Unbekannter Gegenstand", like a deleted one. */
	hiddenReferences?: Record<string, number>
}) {
	// Only fetch the user list when the caller gives no names (guests may not load it).
	const users = usePickerUsers(() => !props.userName)
	const resolvers = () => ({
		userName: props.userName ?? users.nameOf,
		itemName: (id: string) => (id.startsWith(HIDDEN_MARK) ? undefined : props.itemName?.(id)),
	})
	// Placeholders for references the server left out; they resolve to no name.
	const shown = () => {
		const hidden = props.hiddenReferences ?? {}
		if (!Object.keys(hidden).length) return props.attributes
		const out = { ...props.attributes }
		for (const f of props.fields) {
			const n = hidden[f.key]
			if (f.kind !== 'item' || !n) continue
			const marks = Array.from({ length: n }, (_, i) => `${HIDDEN_MARK}${i}`)
			const cur = out[f.key]
			out[f.key] = Array.isArray(cur) ? [...cur, ...marks] : isMultiple(f) ? marks : marks[0]
		}
		return out
	}
	const parts = () => splitAttributes(props.fields, shown())
	const text = (e: { field?: FieldDefinition; value: unknown }) =>
		e.field ? formatAttributeValue(e.field, e.value, resolvers()) : formatUnknown(e.value)
	const swatch = (e: { field?: FieldDefinition; value: unknown }) =>
		e.field?.kind === 'color' && typeof e.value === 'string' ? e.value : undefined
	const warranty = (e: { field?: FieldDefinition; value: unknown }) => {
		const f = e.field
		if (f?.kind !== 'date' || !f.warranty || f.hidden) return null
		const st = warrantyState(e.value, isoDayInBerlin())
		if (!st || st.state === 'active') return null
		if (st.state === 'expired') return { text: m.warranty_expired(), urgent: false }
		return {
			text:
				st.daysLeft === 0
					? m.warranty_ends_today()
					: st.daysLeft === 1
						? m.warranty_ends_tomorrow()
						: m.warranty_ends_in({ count: st.daysLeft }),
			urgent: true,
		}
	}

	const Entries = (p: { entries: ReturnType<typeof parts>['active'] }) => (
		<dl class="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(8rem,auto)_1fr]">
			<For each={p.entries}>
				{(e) => (
					<>
						<dt class="text-sm text-muted-foreground">{e.label}</dt>
						<dd class="flex items-center gap-2 break-words">
							<Show when={swatch(e)}>
								<span
									class="inline-block size-4 rounded-sm border border-foreground/40"
									style={{ 'background-color': swatch(e) }}
									aria-hidden="true"
								/>
							</Show>
							<Show
								when={e.field?.kind === 'url' && typeof e.value === 'string'}
								fallback={text(e)}
							>
								<a
									class="text-primary underline"
									href={e.value as string}
									rel="noopener noreferrer"
									target="_blank"
								>
									{e.value as string}
								</a>
							</Show>
							<Show when={warranty(e)}>
								{(w) => (
									<Badge
										variant={w().urgent ? 'default' : 'outline'}
										data-testid="warranty-state"
									>
										{w().text}
									</Badge>
								)}
							</Show>
						</dd>
					</>
				)}
			</For>
		</dl>
	)

	return (
		<div class="grid gap-4">
			<Show
				when={parts().active.length}
				fallback={<p class="text-sm text-muted-foreground">{m.field_none()}</p>}
			>
				<Entries entries={parts().active} />
			</Show>
			<Show when={!props.hideLegacy && parts().legacy.length}>
				<section
					class="grid gap-2 rounded-md border border-dashed p-3"
					aria-labelledby="legacy-heading"
				>
					<h3 id="legacy-heading" class="text-sm font-semibold">
						{m.field_legacy()}
					</h3>
					<p class="text-sm text-muted-foreground">{m.field_legacy_hint()}</p>
					<Entries entries={parts().legacy} />
				</section>
			</Show>
		</div>
	)
}
