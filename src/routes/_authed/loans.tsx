// Loans and transfers (DESIGN §9 "my loans, due back, pending requests"): offers of items to the caller, loan requests waiting for them, what they lent out (overdue first), what they borrow, and offers they made.
// Contacts for external borrowers are one click away.
import { useQuery } from '@tanstack/solid-query'
import { createFileRoute, Link } from '@tanstack/solid-router'
import { For, type JSX, Show } from 'solid-js'
import { LoanListCard } from '~/components/loans/loan-actions'
import { TransferCard } from '~/components/transfers/transfer'
import { loanOverviewQuery } from '~/lib/loans/queries'
import type { LoanListRow } from '~/lib/loans/types'
import { actionErrorText } from '~/lib/run-action'
import { transferOverviewQuery } from '~/lib/transfers/queries'
import type { TransferListRow } from '~/lib/transfers/types'
import { m } from '~/paraglide/messages'

export const Route = createFileRoute('/_authed/loans')({
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(loanOverviewQuery()),
			context.queryClient.ensureQueryData(transferOverviewQuery()),
		]),
	head: () => ({ meta: [{ title: `${m.loans_title()} · ${m.app_name()}` }] }),
	component: LoansPage,
})

function LoanGroup(props: { id: string; title: string; rows: LoanListRow[]; empty?: JSX.Element }) {
	return (
		<Show when={props.rows.length || props.empty}>
			<section class="grid gap-3" aria-labelledby={props.id}>
				<h2 id={props.id} class="text-lg font-semibold">
					{props.title}
				</h2>
				<Show when={props.rows.length} fallback={props.empty}>
					<ul class="grid gap-2">
						<For each={props.rows}>{(l) => <LoanListCard loan={l} />}</For>
					</ul>
				</Show>
			</section>
		</Show>
	)
}

function TransferGroup(props: { id: string; title: string; rows: TransferListRow[] }) {
	return (
		<Show when={props.rows.length}>
			<section class="grid gap-3" aria-labelledby={props.id}>
				<h2 id={props.id} class="text-lg font-semibold">
					{props.title}
				</h2>
				<ul class="grid gap-2">
					<For each={props.rows}>{(t) => <TransferCard t={t} />}</For>
				</ul>
			</section>
		</Show>
	)
}

function LoansPage() {
	const ctx = Route.useRouteContext()
	const q = useQuery(() => loanOverviewQuery())
	const tq = useQuery(() => transferOverviewQuery())
	const empty = () =>
		!!q.data &&
		!!tq.data &&
		!q.data.mine.length &&
		!q.data.requests.length &&
		!q.data.lentOut.length &&
		!tq.data.incoming.length &&
		!tq.data.outgoing.length
	return (
		<div class="grid gap-6">
			<div class="flex flex-wrap items-center gap-2">
				<h1 class="mr-auto text-2xl font-semibold">{m.loans_title()}</h1>
				<Show when={ctx().user.role !== 'guest'}>
					<Link
						to="/contacts"
						class="text-sm text-primary underline-offset-4 hover:underline"
					>
						{m.contacts_title()}
					</Link>
				</Show>
			</div>
			<Show when={q.isError}>
				<p role="alert" class="text-sm text-destructive">
					{actionErrorText(q.error)}
				</p>
			</Show>
			<Show when={empty()}>
				<p class="text-muted-foreground">{m.loans_empty()}</p>
			</Show>
			<TransferGroup
				id="transfers-incoming"
				title={m.transfers_group_incoming()}
				rows={tq.data?.incoming ?? []}
			/>
			<Show when={q.data}>
				{(d) => (
					<>
						<LoanGroup
							id="loans-requests"
							title={m.loans_group_requests()}
							rows={d().requests}
						/>
						<LoanGroup
							id="loans-lent"
							title={m.loans_group_lent_out()}
							rows={d().lentOut}
						/>
						<LoanGroup id="loans-mine" title={m.loans_group_mine()} rows={d().mine} />
					</>
				)}
			</Show>
			<TransferGroup
				id="transfers-outgoing"
				title={m.transfers_group_outgoing()}
				rows={tq.data?.outgoing ?? []}
			/>
		</div>
	)
}
