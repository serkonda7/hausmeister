// Locations: the whole tree (House → Garage → Shelf 2) with visible item
// counts. Guests see only the locations of items shared with them.
import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { Show } from 'solid-js'
import { CreateLocationForm } from '~/components/locations/location-forms'
import { LocationTree } from '~/components/locations/location-tree'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { formatNumber } from '~/lib/format'
import { itemFacetsQuery, locationsQuery } from '~/lib/items/queries'
import { m } from '~/paraglide/messages'

export const Route = createFileRoute('/_authed/locations/')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(locationsQuery()),
			// `unplacedCount`: items with neither a location nor a container.
			context.queryClient.ensureQueryData(itemFacetsQuery({})),
		]),
	head: () => ({ meta: [{ title: `${m.nav_locations()} · ${m.app_name()}` }] }),
	component: LocationsPage,
})

function LocationsPage() {
	const ctx = Route.useRouteContext()
	const tree = useQuery(() => locationsQuery())
	const facets = useQuery(() => itemFacetsQuery({}))
	const canWrite = () => ctx().user.role !== 'guest'
	return (
		<div class="grid gap-4">
			<h1 class="text-2xl font-semibold">{m.nav_locations()}</h1>
			<Show when={facets.data?.unplacedCount}>
				{(n) => (
					<Link
						to="/items"
						search={{ unplaced: true }}
						class="flex min-h-12 items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span>
							<span class="block font-medium">{m.locations_unplaced()}</span>
							<span class="block text-sm text-muted-foreground">
								{m.locations_unplaced_hint()}
							</span>
						</span>
						<span class="rounded-full bg-secondary px-2 text-sm">
							{formatNumber(n())}
						</span>
					</Link>
				)}
			</Show>
			<Show
				when={(tree.data ?? []).length}
				fallback={
					<p class="rounded-lg border border-dashed p-6 text-muted-foreground">
						{canWrite() ? m.locations_empty() : m.locations_empty_guest()}
					</p>
				}
			>
				<Card>
					<CardContent class="pt-4">
						<p class="mb-2 text-sm text-muted-foreground">{m.locations_tree_hint()}</p>
						<LocationTree nodes={tree.data ?? []} label={m.nav_locations()} />
					</CardContent>
				</Card>
			</Show>
			<Show when={canWrite()}>
				<Card>
					<CardHeader>
						<CardTitle>
							<h2>{m.locations_new_top()}</h2>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<CreateLocationForm parentId={null} idPrefix="loc-new" />
					</CardContent>
				</Card>
			</Show>
		</div>
	)
}
