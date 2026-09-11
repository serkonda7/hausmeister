import { createMemo, createResource, createSignal, Show } from 'solid-js'
import { api, type Transaction } from '../lib/api'
import { useCrudForm } from '../lib/crud'
import { t } from '../lib/i18n'
import { centsToEuroInput, parsePositiveCents } from '../lib/money'
import CategoriesSection from './CategoriesSection'
import CrudForm from './CrudForm'
import PageHeader from './PageHeader'
import TransactionFormFields, { emptyTxnForm, type TxnForm } from './TransactionForm'
import TransactionsList from './TransactionsList'
import TransferFormFields, {
	emptyTransferForm,
	isSameAccountTransfer,
	type TransferForm,
} from './TransferForm'
import './Transactions.css'

type Mode = 'transaction' | 'transfer'

export default function Transactions() {
	const [accountFilter, setAccountFilter] = createSignal('')
	const [directionFilter, setDirectionFilter] = createSignal('')
	const [query, setQuery] = createSignal('')

	const [transactions, { refetch }] = createResource(
		() => accountFilter() || '__all__',
		async () => api.transactions.list(accountFilter() || undefined),
	)
	const [accounts] = createResource(() => api.accounts.list())
	const [categories, { refetch: refetchCats }] = createResource(() => api.categories.list())

	const [mode, setMode] = createSignal<Mode>('transaction')
	// Main form state (show/editing/error shell + field values) via the
	// shared CRUD hook; the transfer field values live alongside and share
	// the same dialog shell + error slot.
	const txnCrud = useCrudForm<TxnForm, Transaction>(emptyTxnForm())
	const [transferForm, setTransferForm] = createSignal<TransferForm>(emptyTransferForm())

	const filtered = createMemo(() => {
		const q = query().trim().toLowerCase()
		const dir = directionFilter()
		return (transactions() ?? [])
			.filter((tt) => (!dir ? true : tt.direction === dir))
			.filter((tt) => {
				if (!q) {
					return true
				}
				return (
					(tt.payee ?? '').toLowerCase().includes(q) ||
					(tt.notes ?? '').toLowerCase().includes(q)
				)
			})
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
	})

	const totals = createMemo(() => {
		let inflow = 0
		let outflow = 0
		for (const tt of filtered()) {
			if (tt.direction === 'inflow') {
				inflow += tt.amountCents
			} else {
				outflow += tt.amountCents
			}
		}
		return { inflow, outflow, net: inflow - outflow }
	})

	const hasActiveFilters = () =>
		accountFilter() !== '' || directionFilter() !== '' || query().trim() !== ''

	function clearFilters() {
		setAccountFilter('')
		setDirectionFilter('')
		setQuery('')
	}

	const sameAccount = () => isSameAccountTransfer(transferForm())

	function openCreate() {
		setMode('transaction')
		txnCrud.openCreate(emptyTxnForm(accountFilter() || accounts()?.[0]?.id || ''))
	}

	function openTransfer() {
		setMode('transfer')
		txnCrud.setEditing(null)
		const list = accounts() ?? []
		const fromId = accountFilter() || list[0]?.id || ''
		setTransferForm(emptyTransferForm(fromId, list.find((a) => a.id !== fromId)?.id || ''))
		txnCrud.setError('')
		txnCrud.setShowForm(true)
	}

	function openEdit(txn: Transaction) {
		if (txn.transferId != null) {
			return
		}
		setMode('transaction')
		txnCrud.openEdit(txn, {
			accountId: txn.accountId,
			date: txn.date,
			payee: txn.payee ?? '',
			categoryId: txn.categoryId ?? '',
			amount: centsToEuroInput(txn.amountCents),
			direction: txn.direction,
			notes: txn.notes ?? '',
		})
	}

	function submitTxn(e: Event) {
		return txnCrud.submit(e, async () => {
			const f = txnCrud.form()
			const amountCents = parsePositiveCents(f.amount)
			if (!f.accountId) {
				throw new Error(t().transactions.accountRequired)
			}
			if (!f.date || amountCents == null) {
				throw new Error(t().transactions.dateAmountRequired)
			}
			const payload = {
				accountId: f.accountId,
				date: f.date,
				payee: f.payee.trim() || null,
				categoryId: f.categoryId || null,
				amountCents,
				direction: f.direction,
				notes: f.notes.trim() || null,
			}
			const eid = txnCrud.editing()
			if (eid) {
				await api.transactions.update(eid.id, payload)
			} else {
				await api.transactions.create(payload)
			}
			await refetch()
		})
	}

	function submitTransfer(e: Event) {
		return txnCrud.submit(e, async () => {
			const f = transferForm()
			const amountCents = parsePositiveCents(f.amount)
			if (!f.fromAccountId || !f.toAccountId) {
				throw new Error(t().transactions.srcDstRequired)
			}
			if (f.fromAccountId === f.toAccountId) {
				throw new Error(t().transactions.srcDstDiffer)
			}
			if (!f.date || amountCents == null) {
				throw new Error(t().transactions.dateAmountRequired)
			}
			await api.transfers.create({
				fromAccountId: f.fromAccountId,
				toAccountId: f.toAccountId,
				amountCents,
				date: f.date,
				payee: f.payee.trim() || null,
				categoryId: f.categoryId || null,
				notes: f.notes.trim() || null,
			})
			await refetch()
		})
	}

	async function remove(txn: Transaction) {
		const msg = txn.transferId
			? t().transactions.deleteTransferConfirm
			: t().transactions.deleteTransactionConfirm
		if (!confirm(msg)) {
			return
		}
		try {
			await api.transactions.remove(txn.id)
			await refetch()
		} catch (err) {
			alert((err as Error).message)
		}
	}

	return (
		<div class="page">
			<PageHeader
				title={t().transactions.title}
				subtitle={t().transactions.subtitle}
				actions={
					<div class="inline-row">
						<button
							type="button"
							onClick={openTransfer}
							class="btn-ghost"
							disabled={(accounts()?.length ?? 0) < 2}
						>
							{t().transactions.transferBtn}
						</button>
						<button
							type="button"
							onClick={openCreate}
							class="btn-primary"
							disabled={(accounts()?.length ?? 0) === 0}
						>
							{t().transactions.addBtn}
						</button>
					</div>
				}
			/>

			<Show when={(accounts()?.length ?? 0) === 0}>
				<p class="muted text-sm">{t().transactions.needAccountHint}</p>
			</Show>

			{/* Create / edit dialog: shared CrudForm shell (autofocus + Esc +
			    error + actions) with the mode tabs + both subforms inside. */}
			<CrudForm
				open={txnCrud.showForm()}
				error={txnCrud.error()}
				editing={mode() === 'transaction' ? txnCrud.editing() : null}
				onSubmit={mode() === 'transaction' ? submitTxn : submitTransfer}
				onCancel={txnCrud.close}
				submitDisabled={mode() === 'transfer' && sameAccount()}
			>
				<div class="segmented" role="tablist" aria-label={t().transactions.entryType}>
					<button
						type="button"
						role="tab"
						aria-selected={mode() === 'transaction'}
						onClick={() => setMode('transaction')}
						class="segmented-tab"
						disabled={txnCrud.editing() != null && mode() !== 'transaction'}
					>
						{t().transactions.tabTransaction}
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode() === 'transfer'}
						onClick={() => setMode('transfer')}
						class="segmented-tab"
						disabled={txnCrud.editing() != null}
						title={
							txnCrud.editing() != null
								? t().transactions.transferEditDisabledTitle
								: t().transactions.transferCreateTitle
						}
					>
						{t().transactions.tabTransfer}
					</button>
				</div>
				<Show when={txnCrud.editing() != null}>
					<p class="muted text-sm">{t().transactions.editingHint}</p>
				</Show>

				<Show when={mode() === 'transaction'}>
					<TransactionFormFields
						form={txnCrud.form}
						setForm={txnCrud.setForm}
						accounts={accounts}
						categories={categories}
					/>
				</Show>

				<Show when={mode() === 'transfer'}>
					<TransferFormFields
						form={transferForm}
						setForm={setTransferForm}
						accounts={accounts}
						categories={categories}
					/>
				</Show>
			</CrudForm>

			<TransactionsList
				accounts={accounts}
				categories={categories}
				filtered={filtered}
				totals={totals}
				accountFilter={accountFilter}
				setAccountFilter={setAccountFilter}
				directionFilter={directionFilter}
				setDirectionFilter={setDirectionFilter}
				query={query}
				setQuery={setQuery}
				hasActiveFilters={hasActiveFilters}
				onClearFilters={clearFilters}
				loading={transactions.loading}
				error={transactions.error}
				onEdit={openEdit}
				onDelete={remove}
				onCreate={openCreate}
			/>

			<CategoriesSection
				categories={categories}
				loading={categories.loading}
				onChanged={() => {
					void refetchCats()
				}}
			/>
		</div>
	)
}
