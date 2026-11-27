// Item list building blocks shared by the items list, the home page and the
// location and container pages: a grid card, a list row, and <ItemResults>,
// which pages through searchItemsFn with the keyset cursor.
//
//   <ItemResults input={toSearchInput(search)} view="grid" />
import { useInfiniteQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { createEffect, createMemo, For, type JSX, onCleanup, Show } from 'solid-js'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { fileUrl } from '~/lib/attachments/rules'
import { cn } from '~/lib/cn'
import { formatCents, formatNumber } from '~/lib/format'
import { typeIconGlyph } from '~/lib/item-types/icons'
import type { SearchItemsInput } from '~/lib/items/inputs'
import { statusLabel } from '~/lib/items/labels'
import type { ItemView } from '~/lib/items/list-search'
import { itemListQuery } from '~/lib/items/queries'
import type { ItemListRow } from '~/lib/items/types'
import { actionErrorText } from '~/lib/run-action'
import { m } from '~/paraglide/messages'

export const itemCountText = (n: number) =>
	n === 1 ? m.items_count_one() : m.items_count({ count: formatNumber(n) })

function Thumb(props: { row: ItemListRow; class?: string }) {
	return (
		<Show
			when={props.row.photoId}
			fallback={
				<span
					class={cn('flex items-center justify-center bg-muted text-3xl', props.class)}
					aria-hidden="true"
				>
					{typeIconGlyph(props.row.typeIcon)}
				</span>
			}
		>
			{(id) => (
				<img
					src={fileUrl(id(), 'thumb')}
					alt=""
					loading="lazy"
					decoding="async"
					class={cn('bg-muted object-cover', props.class)}
				/>
			)}
		</Show>
	)
}

const price = (r: ItemListRow) =>
	'priceCents' in r && r.priceCents != null
		? formatCents(r.priceCents, r.currency ?? 'EUR')
		: null

function StatusBadges(props: { row: ItemListRow }) {
	return (
		<>
			<Show when={props.row.status !== 'available'}>
				<Badge variant={props.row.gone ? 'outline' : 'secondary'}>
					{statusLabel(props.row.status)}
				</Badge>
			</Show>
			<Show when={props.row.lowStock}>
				<Badge variant="destructive">{m.items_low_stock_badge()}</Badge>
			</Show>
		</>
	)
}

const meta = (r: ItemListRow) => [r.locationName, r.owner.name].filter(Boolean).join(' · ')

export function ItemCard(props: { row: ItemListRow }) {
	const r = () => props.row
	return (
		<Link
			to="/items/$itemId"
			params={{ itemId: r().id }}
			class="group flex h-full flex-col overflow-hidden rounded-lg border bg-card shadow-sm hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			data-testid="item-card"
		>
			<Thumb row={r()} class="aspect-square w-full" />
			<div class="grid min-w-0 gap-1 p-2">
				<span class="line-clamp-2 break-words font-medium leading-snug group-hover:underline">
					{r().name}
				</span>
				<span class="truncate text-xs text-muted-foreground">{meta(r())}</span>
				<div class="flex flex-wrap items-center gap-1">
					<StatusBadges row={r()} />
					<Show when={price(r())}>
						{(p) => <span class="ml-auto text-xs font-medium">{p()}</span>}
					</Show>
				</div>
			</div>
		</Link>
	)
}

export function ItemRowView(props: { row: ItemListRow }) {
	const r = () => props.row
	return (
		<Link
			to="/items/$itemId"
			params={{ itemId: r().id }}
			class="flex min-h-16 items-center gap-3 rounded-md px-2 py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			data-testid="item-row"
		>
			<Thumb row={r()} class="size-12 shrink-0 rounded-md text-2xl" />
			<div class="grid min-w-0 flex-1 gap-0.5">
				<span class="truncate font-medium">{r().name}</span>
				<span class="truncate text-xs text-muted-foreground">
					{[r().typeName, meta(r())].filter(Boolean).join(' · ')}
				</span>
				<div class="flex flex-wrap gap-1 empty:hidden">
					<StatusBadges row={r()} />
					<Show when={r().quantity !== 1 || r().unit}>
						<span class="text-xs text-muted-foreground">
							{formatNumber(r().quantity)} {r().unit ?? ''}
						</span>
					</Show>
				</div>
			</div>
			<Show when={price(r())}>
				{(p) => <span class="shrink-0 text-sm font-medium">{p()}</span>}
			</Show>
		</Link>
	)
}

export function ItemGrid(props: { rows: ItemListRow[]; view: ItemView; label: string }) {
	return (
		<Show
			when={props.view === 'list'}
			fallback={
				<ul
					class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
					aria-label={props.label}
					data-testid="item-results"
				>
					<For each={props.rows}>
						{(row) => (
							<li>
								<ItemCard row={row} />
							</li>
						)}
					</For>
				</ul>
			}
		>
			<ul class="grid divide-y" aria-label={props.label} data-testid="item-results">
				<For each={props.rows}>
					{(row) => (
						<li>
							<ItemRowView row={row} />
						</li>
					)}
				</For>
			</ul>
		</Show>
	)
}

/**
 * The paged result list for one searchItemsFn input. Loads the next page when
 * the end of the list scrolls into view, with a "load more" button as the
 * keyboard and fallback path. `empty` is shown when nothing matches.
 */
export function ItemResults(props: {
	input: Omit<SearchItemsInput, 'cursor'>
	view?: ItemView
	label: string
	empty: JSX.Element
	/** Show the result count above the list (announced politely). */
	showCount?: boolean
	/** Stop after the first page (home page teasers). */
	firstPageOnly?: boolean
	/** Called with the total match count whenever it is known. */
	onTotal?: (n: number) => void
}) {
	const q = useInfiniteQuery(() => itemListQuery(props.input))
	const rows = createMemo(() => (q.data?.pages ?? []).flatMap((p) => p.items))
	const first = () => q.data?.pages[0]
	const canLoadMore = () => !props.firstPageOnly && q.hasNextPage
	createEffect(() => {
		const t = first()?.total
		if (t !== undefined) props.onTotal?.(t)
	})

	let sentinel: HTMLDivElement | undefined
	createEffect(() => {
		if (!canLoadMore() || !sentinel || typeof IntersectionObserver === 'undefined') return
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting) && q.hasNextPage && !q.isFetchingNextPage)
					void q.fetchNextPage()
			},
			{ rootMargin: '600px 0px' },
		)
		io.observe(sentinel)
		onCleanup(() => io.disconnect())
	})

	return (
		<div class="grid gap-3">
			<Show when={props.showCount}>
				<div class="min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite">
					<Show when={first()}>
						{(p) => (
							<>
								{itemCountText(p().total)}
								<Show when={p().mode === 'prefix'}> · {m.items_prefix_hint()}</Show>
							</>
						)}
					</Show>
				</div>
			</Show>
			<Show when={q.isError}>
				<p
					role="alert"
					class="rounded-md border border-destructive p-3 text-sm text-destructive"
				>
					{actionErrorText(q.error)}{' '}
					<Button variant="link" class="h-auto p-0" onClick={() => void q.refetch()}>
						{m.items_retry()}
					</Button>
				</p>
			</Show>
			<Show when={q.isPending && !q.data}>
				<p class="text-sm text-muted-foreground">{m.common_loading()}</p>
			</Show>
			<Show when={q.isSuccess && rows().length === 0}>{props.empty}</Show>
			<Show when={rows().length > 0}>
				<ItemGrid rows={rows()} view={props.view ?? 'grid'} label={props.label} />
			</Show>
			<Show when={canLoadMore()}>
				<div ref={sentinel} class="flex justify-center py-2">
					<Button
						variant="outline"
						disabled={q.isFetchingNextPage}
						onClick={() => void q.fetchNextPage()}
					>
						{q.isFetchingNextPage ? m.common_loading() : m.items_load_more()}
					</Button>
				</div>
			</Show>
		</div>
	)
}
