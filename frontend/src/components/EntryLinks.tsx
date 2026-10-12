import { For } from 'solid-js'
import { authorPath, publisherPath, tagPath } from '../routes'
import type { NamedEntry } from '../types'

export type LinkedKind = 'author' | 'publisher' | 'tag'

export function entryPath(kind: LinkedKind, id: string): string {
	if (kind === 'author') return authorPath(id)
	return kind === 'publisher' ? publisherPath(id) : tagPath(id)
}

/** Comma-separated links to the author, publisher or tag pages of `entries`. */
export function EntryLinks(props: {
	kind: LinkedKind
	entries: NamedEntry[]
	onNavigate: (path: string, event: MouseEvent) => void
}) {
	return (
		<For each={props.entries}>
			{(entry, i) => (
				<>
					{i() > 0 && ', '}
					<a
						href={entryPath(props.kind, entry.id)}
						class="book-link"
						onClick={(e) => props.onNavigate(entryPath(props.kind, entry.id), e)}
					>
						{entry.name}
					</a>
				</>
			)}
		</For>
	)
}
