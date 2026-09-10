import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { api, type Category, type Transaction } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatDateISO, formatEUR, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import { accountName, categoryOf } from '../lib/names'
import Amount from './Amount'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'
import './Transactions.css'

type Mode = 'transaction' | 'transfer'

const EMPTY_TXN = {
	accountId: '',
	date: todayISO(),
	payee: '',
	categoryId: '',
	amount: '',
	direction: 'outflow' as 'inflow' | 'outflow',
	notes: '',
}

const EMPTY_TRANSFER = {
	fromAccountId: '',
	toAccountId: '',
	amount: '',
	date: todayISO(),
	payee: '',
	categoryId: '',
	notes: '',
}

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
	const [showForm, setShowForm] = createSignal(false)
	const [editingId, setEditingId] = createSignal<string | null>(null)
	const [error, setError] = createSignal('')
	const [form, setForm] = createSignal({ ...EMPTY_TXN })
	const [transferForm, setTransferForm] = createSignal({ ...EMPTY_TRANSFER })

	// Categories manager state (shared CRUD shell)
	const catCrud = useCrudForm<{ name: string; kind: string; color: string }, Category>({
		name: '',
		kind: '',
		color: '#22c55e',
	})

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

	// Autofocus the first field whenever the create/edit form opens.
	let txnFormWrap: HTMLDivElement | undefined
	createEffect(() => {
		if (showForm() && txnFormWrap) {
			txnFormWrap
				.querySelector<HTMLElement>(
					'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
				)
				?.focus()
		}
	})

	function handleFormKeyDown(e: KeyboardEvent): void {
		if (e.key === 'Escape') {
			setShowForm(false)
		}
	}

	const catForm = catCrud.form
	const setCatForm = catCrud.setForm

	function openCreate() {
		setEditingId(null)
		setMode('transaction')
		setForm({
			...EMPTY_TXN,
			accountId: accountFilter() || accounts()?.[0]?.id || '',
		})
		setError('')
		setShowForm(true)
	}
	function openTransfer() {
		setMode('transfer')
		const list = accounts() ?? []
		setTransferForm({
			...EMPTY_TRANSFER,
			fromAccountId: accountFilter() || list[0]?.id || '',
			toAccountId: list.find((a) => a.id !== (accountFilter() || list[0]?.id))?.id || '',
		})
		setError('')
		setShowForm(true)
	}
	function openEdit(txn: Transaction) {
		if (txn.transferId != null) {
			return
		}
		setEditingId(txn.id)
		setMode('transaction')
		setForm({
			accountId: txn.accountId,
			date: txn.date,
			payee: txn.payee ?? '',
			categoryId: txn.categoryId ?? '',
			amount: centsToEuroInput(txn.amountCents),
			direction: txn.direction,
			notes: txn.notes ?? '',
		})
		setError('')
		setShowForm(true)
	}

	async function submitTxn(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const amountCents = parseEuroToCents(f.amount)
		if (!f.accountId) {
			setError(t().transactions.accountRequired)
			return
		}
		if (!f.date || amountCents == null || Number.isNaN(amountCents) || amountCents <= 0) {
			setError(t().transactions.dateAmountRequired)
			return
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
		try {
			const eid = editingId()
			if (eid) {
				await api.transactions.update(eid, payload)
			} else {
				await api.transactions.create(payload)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function submitTransfer(e: Event) {
		e.preventDefault()
		setError('')
		const f = transferForm()
		const amountCents = parseEuroToCents(f.amount)
		if (!f.fromAccountId || !f.toAccountId) {
			setError(t().transactions.srcDstRequired)
			return
		}
		if (f.fromAccountId === f.toAccountId) {
			setError(t().transactions.srcDstDiffer)
			return
		}
		if (!f.date || amountCents == null || Number.isNaN(amountCents) || amountCents <= 0) {
			setError(t().transactions.dateAmountRequired)
			return
		}
		try {
			await api.transfers.create({
				fromAccountId: f.fromAccountId,
				toAccountId: f.toAccountId,
				amountCents,
				date: f.date,
				payee: f.payee.trim() || null,
				categoryId: f.categoryId || null,
				notes: f.notes.trim() || null,
			})
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
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

	// ---- Categories ----
	function openCatCreate() {
		catCrud.openCreate({ name: '', kind: '', color: '#22c55e' })
	}
	function openCatEdit(c: Category) {
		catCrud.openEdit(c, { name: c.name, kind: c.kind ?? '', color: c.color ?? '#22c55e' })
	}
	function submitCat(e: Event) {
		return catCrud.submit(e, async () => {
			const f = catForm()
			if (!f.name.trim()) {
				throw new Error(t().transactions.nameRequired)
			}
			const payload = {
				name: f.name.trim(),
				kind: (f.kind || null) as Category['kind'],
				color: f.color || null,
			}
			const cur = catCrud.editing()
			if (cur) {
				await api.categories.update(cur.id, payload)
			} else {
				await api.categories.create(payload)
			}
			await refetchCats()
		})
	}
	function removeCat(id: string) {
		return removeWithConfirm(
			t().transactions.deleteCategoryConfirm,
			() => api.categories.remove(id),
			refetchCats,
		)
	}

	const isTransferLeg = (txn: Transaction) => txn.transferId != null

	// Medium audit: live client-side hint when source == destination.
	const transferSameAccount = () => {
		const f = transferForm()
		return f.fromAccountId !== '' && f.fromAccountId === f.toAccountId
	}

	function categoryKindLabel(kind: string | null | undefined): string {
		const d = t().transactions
		switch (kind) {
			case 'income':
				return d.incomeKind
			case 'expense':
				return d.expenseKind
			default:
				return d.both
		}
	}

	return (
		<div class="page">
			<div class="page-header">
				<div>
					<h2 class="page-title">{t().transactions.title}</h2>
					<p class="page-subtitle">{t().transactions.subtitle}</p>
				</div>
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
			</div>

			<Show when={(accounts()?.length ?? 0) === 0}>
				<p class="muted text-sm">{t().transactions.needAccountHint}</p>
			</Show>

			{/* Filters + totals */}
			<div class="card card--compact">
				<div class="form-grid">
					<label class="field">
						{t().transactions.account}
						<select
							value={accountFilter()}
							onChange={(e) => setAccountFilter(e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().transactions.allAccounts}</option>
							<For each={accounts() ?? []}>
								{(a) => <option value={a.id}>{a.name}</option>}
							</For>
						</select>
					</label>
					<label class="field">
						{t().transactions.direction}
						<select
							value={directionFilter()}
							onChange={(e) => setDirectionFilter(e.currentTarget.value)}
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
							value={query()}
							onInput={(e) => setQuery(e.currentTarget.value)}
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
						{filtered().length} {t().transactions.results} · {t().transactions.income}{' '}
						{formatEUR(totals().inflow)} · {t().transactions.expenses}{' '}
						{formatEUR(totals().outflow)} · {t().transactions.net}{' '}
						<Amount
							cents={totals().net}
							direction={totals().net >= 0 ? 'inflow' : 'outflow'}
							showSign={false}
						/>
					</span>
				</span>
				<Show when={hasActiveFilters()}>
					<button type="button" onClick={clearFilters} class="btn-ghost">
						{t().transactions.clearFilters}
					</button>
				</Show>
			</div>

			{/* Create / edit form */}
			<Show when={showForm()}>
				<div
					class="form-card"
					ref={txnFormWrap}
					onKeyDown={handleFormKeyDown}
					role="dialog"
					aria-label={t().transactions.dialogLabel}
				>
					<div class="segmented" role="tablist" aria-label={t().transactions.entryType}>
						<button
							type="button"
							role="tab"
							aria-selected={mode() === 'transaction'}
							onClick={() => setMode('transaction')}
							class="segmented-tab"
							disabled={editingId() != null && mode() !== 'transaction'}
						>
							{t().transactions.tabTransaction}
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mode() === 'transfer'}
							onClick={() => setMode('transfer')}
							class="segmented-tab"
							disabled={editingId() != null}
							title={
								editingId() != null
									? t().transactions.transferEditDisabledTitle
									: t().transactions.transferCreateTitle
							}
						>
							{t().transactions.tabTransfer}
						</button>
					</div>
					<Show when={editingId() != null}>
						<p class="muted text-sm">{t().transactions.editingHint}</p>
					</Show>

					<Show when={mode() === 'transaction'}>
						<form onSubmit={submitTxn} class="txn-subform">
							<div class="form-grid">
								<label class="field">
									{t().transactions.account}
									<select
										value={form().accountId}
										onChange={(e) =>
											patchForm(setForm, 'accountId', e.currentTarget.value)
										}
										required
										class="input"
									>
										<option value="">{t().common.select}</option>
										<For each={accounts() ?? []}>
											{(a) => <option value={a.id}>{a.name}</option>}
										</For>
									</select>
								</label>
								<label class="field" for="txn-date">
									{t().transactions.date}
									<DateInput
										id="txn-date"
										value={form().date}
										onInput={(v) => patchForm(setForm, 'date', v)}
										required
									/>
								</label>
								<label class="field">
									{t().transactions.payee}
									<input
										value={form().payee}
										onInput={(e) =>
											patchForm(setForm, 'payee', e.currentTarget.value)
										}
										class="input"
										placeholder={t().transactions.payeePlaceholder}
									/>
								</label>
								<label class="field">
									{t().transactions.category}
									<select
										value={form().categoryId}
										onChange={(e) =>
											patchForm(setForm, 'categoryId', e.currentTarget.value)
										}
										class="input"
									>
										<option value="">{t().common.none}</option>
										<For each={categories() ?? []}>
											{(c) => <option value={c.id}>{c.name}</option>}
										</For>
									</select>
								</label>
								<label class="field">
									{t().transactions.amount}
									<input
										type="number"
										step="0.01"
										min="0.01"
										value={form().amount}
										onInput={(e) =>
											patchForm(setForm, 'amount', e.currentTarget.value)
										}
										required
										class="input"
									/>
								</label>
								<label class="field">
									{t().transactions.direction}
									<select
										value={form().direction}
										onChange={(e) =>
											patchForm(
												setForm,
												'direction',
												e.currentTarget.value as 'inflow' | 'outflow',
											)
										}
										class="input"
									>
										<option value="inflow">{t().transactions.inflow}</option>
										<option value="outflow">{t().transactions.outflow}</option>
									</select>
								</label>
							</div>
							<label class="field">
								{t().transactions.notesField}
								<input
									value={form().notes}
									onInput={(e) =>
										patchForm(setForm, 'notes', e.currentTarget.value)
									}
									class="input"
								/>
							</label>
							<Show when={error()}>
								<p class="form-error">{error()}</p>
							</Show>
							<div class="form-actions">
								<button
									type="button"
									onClick={() => setShowForm(false)}
									class="btn-ghost"
								>
									{t().common.cancel}
								</button>
								<button type="submit" class="btn-primary">
									{editingId() ? t().common.save : t().common.create}
								</button>
							</div>
						</form>
					</Show>

					<Show when={mode() === 'transfer'}>
						<form onSubmit={submitTransfer} class="txn-subform">
							<div class="form-grid">
								<label class="field">
									<span class="field-label">
										{t().transactions.fromAccount}{' '}
										<span class="req" aria-hidden="true">
											*
										</span>
									</span>
									<select
										value={transferForm().fromAccountId}
										onChange={(e) =>
											setTransferForm((p) => ({
												...p,
												fromAccountId: e.currentTarget.value,
											}))
										}
										required
										aria-required="true"
										class="input"
									>
										<option value="">{t().common.select}</option>
										<For each={accounts() ?? []}>
											{(a) => <option value={a.id}>{a.name}</option>}
										</For>
									</select>
								</label>
								<label class="field">
									<span class="field-label">
										{t().transactions.toAccount}{' '}
										<span class="req" aria-hidden="true">
											*
										</span>
									</span>
									<select
										value={transferForm().toAccountId}
										onChange={(e) =>
											setTransferForm((p) => ({
												...p,
												toAccountId: e.currentTarget.value,
											}))
										}
										required
										aria-required="true"
										aria-describedby="transfer-accounts-hint"
										class="input"
									>
										<option value="">{t().common.select}</option>
										<For each={accounts() ?? []}>
											{(a) => <option value={a.id}>{a.name}</option>}
										</For>
									</select>
								</label>
								<label class="field">
									{t().transactions.amount}
									<input
										type="number"
										step="0.01"
										min="0.01"
										value={transferForm().amount}
										onInput={(e) =>
											setTransferForm((p) => ({
												...p,
												amount: e.currentTarget.value,
											}))
										}
										required
										class="input"
									/>
								</label>
								<label class="field" for="transfer-date">
									{t().transactions.date}
									<DateInput
										id="transfer-date"
										value={transferForm().date}
										onInput={(v) => setTransferForm((p) => ({ ...p, date: v }))}
										required
									/>
								</label>
								<label class="field">
									{t().transactions.payeeOptional}
									<input
										value={transferForm().payee}
										onInput={(e) =>
											setTransferForm((p) => ({
												...p,
												payee: e.currentTarget.value,
											}))
										}
										class="input"
									/>
								</label>
								<label class="field">
									{t().transactions.categoryOptional}
									<select
										value={transferForm().categoryId}
										onChange={(e) =>
											setTransferForm((p) => ({
												...p,
												categoryId: e.currentTarget.value,
											}))
										}
										class="input"
									>
										<option value="">{t().common.none}</option>
										<For each={categories() ?? []}>
											{(c) => <option value={c.id}>{c.name}</option>}
										</For>
									</select>
								</label>
							</div>
							<Show when={transferSameAccount()}>
								<p id="transfer-accounts-hint" class="form-hint form-hint--error">
									{t().transactions.sameAccountHint}
								</p>
							</Show>
							<label class="field">
								{t().transactions.notesField}
								<input
									value={transferForm().notes}
									onInput={(e) =>
										setTransferForm((p) => ({
											...p,
											notes: e.currentTarget.value,
										}))
									}
									class="input"
								/>
							</label>
							<p class="muted text-sm">{t().transactions.transferExplainer}</p>
							<Show when={error()}>
								<p class="form-error">{error()}</p>
							</Show>
							<div class="form-actions">
								<button
									type="button"
									onClick={() => setShowForm(false)}
									class="btn-ghost"
								>
									{t().common.cancel}
								</button>
								<button
									type="submit"
									class="btn-primary"
									disabled={transferSameAccount()}
								>
									{t().transactions.submitTransfer}
								</button>
							</div>
						</form>
					</Show>
				</div>
			</Show>

			<Show when={transactions.loading}>
				<p class="muted">{t().common.loading}</p>
			</Show>
			<Show when={transactions.error}>
				<p class="form-error">
					{t().common.error}: {(transactions.error as Error).message}
				</p>
			</Show>

			{/* Medium audit: `ledger` tightens rows on desktop via CSS only. */}
			<div class="list list--tight ledger">
				<For each={filtered()}>
					{(txn) => {
						const cat = () => categoryOf(categories(), txn.categoryId)
						return (
							<div class="card card--compact card-row">
								<div>
									<div class="title">
										{txn.payee || (
											<span class="subtle">{t().transactions.noPayee}</span>
										)}{' '}
										<Show when={isTransferLeg(txn)}>
											<span
												class="subtle text-sm"
												title={`${t().transactions.transferPrefix} ${txn.transferId}`}
											>
												{t().transactions.transferBadge}
											</span>
										</Show>
									</div>
									<div class="muted text-sm">
										{formatDateISO(txn.date)} ·{' '}
										{accountName(accounts(), txn.accountId)}
										<Show when={cat()}>
											{' '}
											·{' '}
											<span
												class="inline-row"
												style={{ display: 'inline-flex' }}
											>
												<Show when={cat()?.color}>
													<span
														class="dot dot--sm"
														style={{
															background: cat()?.color ?? '#9ca3af',
														}}
													/>
												</Show>
												{cat()?.name}
											</span>
										</Show>
										<Show when={txn.notes}> · {txn.notes}</Show>
									</div>
								</div>
								<div class="card-actions">
									<Amount cents={txn.amountCents} direction={txn.direction} />
									<Show
										when={!isTransferLeg(txn)}
										fallback={
											<button
												type="button"
												onClick={() => remove(txn)}
												class="btn-icon btn-icon--danger"
												aria-label={t().transactions.deleteTransfer}
												title={t().transactions.deleteTransferTitle}
											>
												✕
											</button>
										}
									>
										<CrudRow
											onEdit={() => openEdit(txn)}
											onDelete={() => remove(txn)}
										/>
									</Show>
								</div>
							</div>
						)
					}}
				</For>
				<Show when={filtered().length === 0 && !transactions.loading}>
					<EmptyState actionLabel={t().transactions.emptyAction} onAction={openCreate}>
						{t().transactions.emptyText}
					</EmptyState>
				</Show>
			</div>

			{/* Categories */}
			<div class="page-header" style={{ 'margin-top': '1rem' }}>
				<h2 class="page-title">{t().transactions.categoriesTitle}</h2>
				<button type="button" onClick={openCatCreate} class="btn-ghost">
					{t().transactions.addCategory}
				</button>
			</div>

			<CrudForm
				open={catCrud.showForm()}
				error={catCrud.error()}
				editing={catCrud.editing()}
				onSubmit={submitCat}
				onCancel={catCrud.close}
			>
				<div class="form-grid">
					<label class="field">
						{t().transactions.nameField}
						<input
							value={catForm().name}
							onInput={(e) => patchForm(setCatForm, 'name', e.currentTarget.value)}
							required
							class="input"
							placeholder={t().transactions.categoryPlaceholder}
						/>
					</label>
					<label class="field">
						{t().transactions.kind}
						<select
							value={catForm().kind}
							onChange={(e) => patchForm(setCatForm, 'kind', e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().transactions.both}</option>
							<option value="income">{t().transactions.incomeKind}</option>
							<option value="expense">{t().transactions.expenseKind}</option>
						</select>
					</label>
					<label class="field">
						{t().transactions.color}
						<input
							type="color"
							value={catForm().color}
							onInput={(e) => patchForm(setCatForm, 'color', e.currentTarget.value)}
							class="color-swatch"
							aria-label={t().transactions.categoryColorLabel}
						/>
					</label>
				</div>
			</CrudForm>

			<div class="list list--tight">
				<For each={categories() ?? []}>
					{(c) => (
						<div class="card card--compact card-row">
							<div class="inline-row">
								<span class="dot" style={{ background: c.color ?? '#9ca3af' }} />
								<span class="strong">{c.name}</span>
								<span class="muted text-sm">· {categoryKindLabel(c.kind)}</span>
							</div>
							<CrudRow
								onEdit={() => openCatEdit(c)}
								onDelete={() => removeCat(c.id)}
							/>
						</div>
					)}
				</For>
				<Show when={(categories() ?? []).length === 0 && !categories.loading}>
					<EmptyState actionLabel={t().transactions.addCategory} onAction={openCatCreate}>
						{t().transactions.emptyText}
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
