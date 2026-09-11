import { For, type JSX, Show } from 'solid-js'
import type { Account, Category, Transaction } from '../lib/api'
import { formatDateISO, formatEUR } from '../lib/format'
import { t } from '../lib/i18n'
import { accountName, categoryOf } from '../lib/names'
import Amount from './Amount'
import Dot from './Dot'
import EmptyState from './EmptyState'
import EntityCard from './EntityCard'
import ListState from './ListState'

export interface TxnTotals {
	inflow: number
	outflow: number
	net: number
}

interface TransactionsListProps {
	accounts: () => Account[] | undefined
	categories: () => Category[] | undefined
	filtered: () => Transaction[]
	totals: () => TxnTotals
	accountFilter: () => string
	setAccountFilter: (value: string) => void
	directionFilter: () => string
	setDirectionFilter: (value: string) => void
	query: () => string
	setQuery: (value: string) => void
	hasActiveFilters: () => boolean
	onClearFilters: () => void
	loading: boolean
	error?: string | Error | { message?: unknown } | null | undefined | false
	onEdit: (txn: Transaction) => void
	onDelete: (txn: Transaction) => void
	onCreate: () => void
}

const isTransferLeg = (txn: Transaction): boolean => txn.transferId != null

/** Filters + sticky summary bar + ledger rows. */
export default function TransactionsList(props: TransactionsListProps): JSX.Element {
	return (
		<>
			{/* Filters + totals */}
			<div class="card card--compact">
				<div class="form-grid">
					<label class="field">
						{t().transactions.account}
						<select
							value={props.accountFilter()}
							onChange={(e) => props.setAccountFilter(e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().transactions.allAccounts}</option>
							<For each={props.accounts() ?? []}>
								{(a) => <option value={a.id}>{a.name}</option>}
							</For>
						</select>
					</label>
					<label class="field">
						{t().transactions.direction}
						<select
							value={props.directionFilter()}
							onChange={(e) => props.setDirectionFilter(e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().transactions.all}</option>
							<option value="inflow">{t().transactions.inflows}</option>
							<option value="outflow">{t().transactions.outflows}</option>
						</select>
					</label>
				</div>
				<div class="form-grid" style={{ 'margin-top': '0.75rem' }}>
					<label class="field">
						{t().transactions.search}
						<input
							value={props.query()}
							onInput={(e) => props.setQuery(e.currentTarget.value)}
							class="input"
							placeholder={t().transactions.searchPlaceholder}
						/>
					</label>
				</div>
			</div>

			{/* Sticky summary bar: hits + totals + clear-filters */}
			<div class="txn-summary" role="status">
				<span class="txn-summary-stats">
					<span>
						{props.filtered().length} {t().transactions.results} ·{' '}
						{t().transactions.income} {formatEUR(props.totals().inflow)} ·{' '}
						{t().transactions.expenses} {formatEUR(props.totals().outflow)} ·{' '}
						{t().transactions.net}{' '}
						<Amount cents={props.totals().net} showSign={false} />
					</span>
				</span>
				<Show when={props.hasActiveFilters()}>
					<button type="button" onClick={props.onClearFilters} class="btn-ghost">
						{t().transactions.clearFilters}
					</button>
				</Show>
			</div>

			<ListState loading={props.loading} error={props.error} />

			{/* Medium audit: `ledger` tightens rows on desktop via CSS only. */}
			<div class="list list--tight ledger">
				<For each={props.filtered()}>
					{(txn) => {
						const cat = () => categoryOf(props.categories(), txn.categoryId)
						const transfer = isTransferLeg(txn)
						return (
							<EntityCard
								title={
									<>
										{txn.payee || (
											<span class="subtle">{t().transactions.noPayee}</span>
										)}{' '}
										<Show when={transfer}>
											<span
												class="subtle text-sm"
												title={`${t().transactions.transferPrefix} ${txn.transferId}`}
											>
												{t().transactions.transferBadge}
											</span>
										</Show>
									</>
								}
								meta={
									<>
										{formatDateISO(txn.date)} ·{' '}
										{accountName(props.accounts(), txn.accountId)}
										<Show when={cat()}>
											{' '}
											·{' '}
											<span
												class="inline-row"
												style={{ display: 'inline-flex' }}
											>
												<Show when={cat()?.color}>
													<Dot color={cat()?.color} small />
												</Show>
												{cat()?.name}
											</span>
										</Show>
										<Show when={txn.notes}> · {txn.notes}</Show>
									</>
								}
								amount={
									<Amount cents={txn.amountCents} direction={txn.direction} />
								}
								onEdit={transfer ? undefined : () => props.onEdit(txn)}
								onDelete={() => props.onDelete(txn)}
								deleteLabel={
									transfer ? t().transactions.deleteTransferTitle : undefined
								}
							/>
						)
					}}
				</For>
				<Show when={props.filtered().length === 0 && !props.loading}>
					<EmptyState
						actionLabel={t().transactions.emptyAction}
						onAction={props.onCreate}
					>
						{t().transactions.emptyText}
					</EmptyState>
				</Show>
			</div>
		</>
	)
}
