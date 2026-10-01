import { IconEdit, IconTrash } from '@tabler/icons-solidjs'
import { For, type JSX, Show } from 'solid-js'
import { t } from '../i18n'
import type { NamedEntry } from '../types'

function EntryActions(props: { name: string; onRename: () => void; onRemove: () => void }) {
	return (
		<span class="manage-actions">
			<button
				type="button"
				class="ghost small-btn catalog-rename-btn"
				onClick={props.onRename}
				aria-label={t('common.rename', { name: props.name })}
				title={t('common.rename', { name: props.name })}
			>
				<IconEdit size={14} />
			</button>
			<button
				type="button"
				class="danger-ghost"
				onClick={props.onRemove}
				aria-label={t('common.delete', { name: props.name })}
				title={t('common.delete', { name: props.name })}
			>
				<IconTrash size={14} />
			</button>
		</span>
	)
}

export type EntryTableProps<T extends NamedEntry> = {
	label: string
	class?: string
	items: T[]
	onRename: (id: string, current: string) => void
	onRemove: (id: string, name: string) => void
	/** Name cell content and tooltip; defaults to the plain name. */
	renderName?: (item: T) => JSX.Element
	nameTitle?: (item: T) => string
	nameStyle?: (item: T) => string | undefined
	/** Optional extra column between name and book count. */
	extraColumn?: { label: string; render: (item: T) => JSX.Element }
}

/** Name / books / actions table for catalog entries and locations. */
export function EntryTable<T extends NamedEntry>(props: EntryTableProps<T>) {
	const row = (item: T) => (
		<tr>
			<td
				class="catalog-table-name"
				title={props.nameTitle?.(item) ?? item.name}
				style={props.nameStyle?.(item)}
			>
				{props.renderName?.(item) ?? item.name}
			</td>
			<Show when={props.extraColumn}>{(extra) => <td>{extra().render(item)}</td>}</Show>
			<td class="catalog-table-books">{item.bookCount ?? 0}</td>
			<td>
				<EntryActions
					name={item.name}
					onRename={() => props.onRename(item.id, item.name)}
					onRemove={() => props.onRemove(item.id, item.name)}
				/>
			</td>
		</tr>
	)

	return (
		<div class="catalog-table-wrap">
			<table class={props.class ?? 'catalog-table'} aria-label={props.label}>
				<thead>
					<tr>
						<th scope="col">{t('common.name')}</th>
						<Show when={props.extraColumn}>{(extra) => <th scope="col">{extra().label}</th>}</Show>
						<th scope="col">{t('common.books')}</th>
						<th scope="col">
							<span class="sr-only">{t('common.actions')}</span>
						</th>
					</tr>
				</thead>
				<tbody>
					<For each={props.items}>{row}</For>
				</tbody>
			</table>
		</div>
	)
}
