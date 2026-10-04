import { For } from 'solid-js'
import { authorPath, publisherPath } from '../routes'
import type { NamedEntry } from '../types'

export type LinkedKind = 'author' | 'publisher'

export function entryPath(kind: LinkedKind, id: string): string {
	return kind === 'author' ? authorPath(id) : publisherPath(id)
}

/** Comma-separated links to the author or publisher pages of `entries`. */
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
