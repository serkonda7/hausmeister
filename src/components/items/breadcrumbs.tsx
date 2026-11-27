// An item's place as breadcrumbs: locations, then containers. A container the
// caller cannot see shows as one neutral placeholder step (Crumb "hidden").
import { Link } from '@tanstack/solid-router'
import { For, Match, Show, Switch } from 'solid-js'
import type { Crumb } from '~/lib/items/types'
import { m } from '~/paraglide/messages'

export function ItemBreadcrumbs(props: { path: Crumb[]; label?: string; empty?: string }) {
	return (
		<Show
			when={props.path.length}
			fallback={
				<span class="text-muted-foreground">{props.empty ?? m.item_no_location()}</span>
			}
		>
			<nav aria-label={props.label ?? m.item_breadcrumbs()}>
				<ol class="flex flex-wrap items-center gap-x-1 gap-y-1">
					<For each={props.path}>
						{(c, i) => (
							<li class="flex min-w-0 items-center gap-1">
								<Show when={i() > 0}>
									<span aria-hidden="true" class="text-muted-foreground">
										›
									</span>
								</Show>
								<Switch>
									<Match when={c.kind === 'location' && c}>
										{(l) => (
											<Link
												to="/locations/$locationId"
												params={{ locationId: l().id }}
												class="break-words text-primary underline-offset-4 hover:underline"
											>
												{l().name}
											</Link>
										)}
									</Match>
									<Match when={c.kind === 'item' && c}>
										{(it) => (
											<Link
												to="/items/$itemId"
												params={{ itemId: it().id }}
												class="break-words text-primary underline-offset-4 hover:underline"
											>
												<span aria-hidden="true">📦 </span>
												{it().name}
											</Link>
										)}
									</Match>
									<Match when={c.kind === 'hidden'}>
										<span class="italic text-muted-foreground">
											{m.items_hidden_container()}
										</span>
									</Match>
								</Switch>
							</li>
						)}
					</For>
				</ol>
			</nav>
		</Show>
	)
}
