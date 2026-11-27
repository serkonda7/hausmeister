import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { For, Show } from 'solid-js'
import { trackingLabel } from '~/components/item-types/type-editor'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { guardSection } from '~/lib/admin-sections'
import { typeIconGlyph } from '~/lib/item-types/icons'
import { itemTypesQuery } from '~/lib/item-types/queries'
import type { TreeNode } from '~/lib/item-types/tree'
import { m } from '~/paraglide/messages'
import type { ItemTypeSummary } from '~/server/item-types/service'

export const Route = createFileRoute('/_authed/admin/types/')({
	beforeLoad: ({ context }) => guardSection(context.user.role, '/admin/types'),
	loader: ({ context }) => context.queryClient.ensureQueryData(itemTypesQuery()),
	head: () => ({ meta: [{ title: `${m.types_title()} · ${m.app_name()}` }] }),
	component: TypesPage,
})

function TypesPage() {
	const ctx = Route.useRouteContext()
	const types = useQuery(() => itemTypesQuery())
	const canCreate = () => ctx().user.role !== 'guest'
	return (
		<Card>
			<CardHeader class="flex-row flex-wrap items-start justify-between gap-3">
				<div class="grid gap-1.5">
					<CardTitle>
						<h2>{m.types_title()}</h2>
					</CardTitle>
					<CardDescription>{m.types_intro()}</CardDescription>
				</div>
				<Show when={canCreate()}>
					<Button as={Link} to="/admin/types/new">
						+ {m.types_new()}
					</Button>
				</Show>
			</CardHeader>
			<CardContent>
				<Show
					when={types.data?.length}
					fallback={<p class="text-sm text-muted-foreground">{m.types_empty()}</p>}
				>
					<TypeTree nodes={types.data ?? []} />
				</Show>
			</CardContent>
		</Card>
	)
}

function TypeTree(props: { nodes: TreeNode<ItemTypeSummary>[] }) {
	return (
		<ul class="grid gap-2">
			<For each={props.nodes}>
				{(n) => (
					<li class="grid gap-2">
						<Link
							to="/admin/types/$typeId"
							params={{ typeId: n.id }}
							class="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span aria-hidden="true" class="text-2xl">
								{typeIconGlyph(n.icon)}
							</span>
							<span class="font-medium">{n.name}</span>
							<span class="flex flex-wrap gap-1 text-xs">
								<Show when={n.archivedAt}>
									<Badge variant="secondary">{m.types_archived_badge()}</Badge>
								</Show>
								<Show when={n.tracking === 'stock'}>
									<Badge variant="outline">{trackingLabel(n.tracking)}</Badge>
								</Show>
							</span>
							<span class="ml-auto text-sm text-muted-foreground">
								{m.types_fields_count({ count: String(n.fieldCount) })}
								<Show when={n.itemCount !== null}>
									{' · '}
									{m.types_items_count({ count: String(n.itemCount) })}
								</Show>
							</span>
						</Link>
						<Show when={n.children.length}>
							<div class="border-l-2 pl-3 sm:pl-5">
								<TypeTree nodes={n.children} />
							</div>
						</Show>
					</li>
				)}
			</For>
		</ul>
	)
}
