// What a scan found, with quick actions (DESIGN §9 "Scan"): an item with check out / return / ±stock, a location to open or fill, or the items carrying a barcode or ISBN (with "add" when there are none).
import { useQuery } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { For, type JSX, Show } from 'solid-js'
import { ItemBreadcrumbs } from '~/components/items/breadcrumbs'
import { ItemRowView } from '~/components/items/item-card'
import { StockControl } from '~/components/items/stock-control'
import { useLoanWrite } from '~/components/loans/loan-actions'
import { Badge } from '~/components/ui/badge'
import { Button, buttonVariants } from '~/components/ui/button'
import { typeIconGlyph } from '~/lib/item-types/icons'
import { statusLabel } from '~/lib/items/labels'
import { itemQuery, locationQuery } from '~/lib/items/queries'
import { loanSummary } from '~/lib/loans/labels'
import { itemLoansQuery } from '~/lib/loans/queries'
import type { CodeLookup } from '~/lib/scan/types'
import { m } from '~/paraglide/messages'
import { checkoutItemFn, returnLoanFn } from '~/server/loans/functions'

function Frame(props: { title: JSX.Element; children: JSX.Element }) {
	return (
		<section
			class="grid gap-3 rounded-lg border border-primary bg-card p-4"
			aria-live="polite"
			data-testid="scan-result"
		>
			<h2 class="break-words text-lg font-semibold">{props.title}</h2>
			{props.children}
		</section>
	)
}

function ItemResult(props: { id: string }) {
	const d = useQuery(() => itemQuery(props.id))
	const l = useQuery(() => itemLoansQuery(props.id))
	const write = useLoanWrite()
	return (
		<Show when={d.data}>
			{(detail) => {
				const it = () => detail().item
				const stock = () => detail().type.tracking === 'stock'
				return (
					<Frame
						title={
							<Link
								to="/items/$itemId"
								params={{ itemId: it().id }}
								class="underline-offset-4 hover:underline"
							>
								<span aria-hidden="true">{typeIconGlyph(detail().type.icon)} </span>
								{it().name}
							</Link>
						}
					>
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<Badge variant={it().status === 'available' ? 'outline' : 'default'}>
								{statusLabel(it().status)}
							</Badge>
							<span class="text-muted-foreground">{detail().owner.name}</span>
						</div>
						<Show when={detail().path.length}>
							<div class="text-sm">
								<ItemBreadcrumbs path={detail().path} />
							</div>
						</Show>
						<Show when={stock() || it().minQuantity != null}>
							<StockControl
								item={it()}
								canUse={detail().permissions.canUse}
								compact
							/>
						</Show>
						<Show when={l.data}>
							{(loans) => (
								<div class="grid gap-2">
									<For each={loans().open.filter((x) => x.status === 'out')}>
										{(loan) => (
											<div class="flex flex-wrap items-center gap-2">
												<span class="text-sm">
													{m.scan_lent_to({
														summary: loanSummary(loan, {
															stock: stock(),
														}),
													})}
												</span>
												<Show when={loan.actions.return}>
													<Button
														onClick={() =>
															void write(
																() =>
																	returnLoanFn({
																		data: { loanId: loan.id },
																	}),
																m.loans_returned_toast({
																	name: it().name,
																}),
															)
														}
													>
														{m.loans_action_return()}
													</Button>
												</Show>
											</div>
										)}
									</For>
									<div class="flex flex-wrap gap-2">
										<Show when={loans().canCheckout && loans().available >= 1}>
											<Button
												onClick={() =>
													void write(
														() =>
															checkoutItemFn({
																data: { itemId: it().id },
															}),
														m.loans_lent_toast({ name: it().name }),
													)
												}
											>
												{m.scan_checkout_me()}
											</Button>
										</Show>
										<Link
											to="/items/$itemId"
											params={{ itemId: it().id }}
											class={buttonVariants({ variant: 'outline' })}
										>
											{loans().canCheckout || !loans().canRequest
												? m.scan_open_item()
												: m.scan_open_to_request()}
										</Link>
									</div>
								</div>
							)}
						</Show>
					</Frame>
				)
			}}
		</Show>
	)
}

function LocationResult(props: { id: string; canAdd: boolean }) {
	const q = useQuery(() => locationQuery(props.id))
	return (
		<Show when={q.data}>
			{(l) => (
				<Frame title={l().name}>
					<Show when={l().path.length}>
						<p class="text-sm text-muted-foreground">
							{l()
								.path.map((p) => p.name)
								.join(' › ')}
						</p>
					</Show>
					<p class="text-sm">{m.scan_location_count({ count: l().totalCount })}</p>
					<div class="flex flex-wrap gap-2">
						<Link
							to="/locations/$locationId"
							params={{ locationId: l().id }}
							class={buttonVariants({ variant: 'default' })}
						>
							{m.scan_open_location()}
						</Link>
						<Show when={props.canAdd}>
							<Link
								to="/items/new"
								search={{ loc: l().id }}
								class={buttonVariants({ variant: 'outline' })}
							>
								{m.scan_add_here()}
							</Link>
						</Show>
					</div>
				</Frame>
			)}
		</Show>
	)
}

export function ScanResult(props: { result: CodeLookup; canAdd: boolean }) {
	const r = () => props.result
	return (
		<>
			<Show when={r().kind === 'item' && r()}>
				{(x) => <ItemResult id={(x() as { id: string }).id} />}
			</Show>
			<Show when={r().kind === 'location' && r()}>
				{(x) => <LocationResult id={(x() as { id: string }).id} canAdd={props.canAdd} />}
			</Show>
			<Show
				when={
					r().kind === 'matches'
						? (r() as Extract<CodeLookup, { kind: 'matches' }>)
						: null
				}
			>
				{(x) => (
					<Frame
						title={
							x().items.length
								? m.scan_matches({ count: x().items.length, code: x().code })
								: m.scan_no_match({ code: x().code })
						}
					>
						<Show when={x().items.length}>
							<ul class="grid divide-y" aria-label={m.scan_matches_label()}>
								<For each={x().items}>
									{(row) => (
										<li>
											<ItemRowView row={row} />
										</li>
									)}
								</For>
							</ul>
						</Show>
						<Show when={props.canAdd}>
							<div>
								<Link
									to="/items/new"
									search={
										x().isbn
											? { isbn: x().isbn ?? undefined }
											: { barcode: x().code }
									}
									class={buttonVariants({
										variant: x().items.length ? 'outline' : 'default',
									})}
								>
									{x().isbn ? m.scan_add_book() : m.scan_add_with_code()}
								</Link>
							</div>
						</Show>
					</Frame>
				)}
			</Show>
		</>
	)
}
