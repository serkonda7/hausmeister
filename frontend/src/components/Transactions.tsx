import { createEffect, createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { api, type Category, type Transaction } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatDateISO, formatEUR, todayISO } from '../lib/format'
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
			.filter((t) => (!dir ? true : t.direction === dir))
			.filter((t) => {
				if (!q) {
					return true
				}
				return (
					(t.payee ?? '').toLowerCase().includes(q) ||
					(t.notes ?? '').toLowerCase().includes(q)
				)
			})
			.slice()
			.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
	})

	const totals = createMemo(() => {
		let inflow = 0
		let outflow = 0
		for (const t of filtered()) {
			if (t.direction === 'inflow') {
				inflow += t.amountCents
			} else {
				outflow += t.amountCents
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
	function openEdit(t: Transaction) {
		if (t.transferId != null) {
			return
		}
		setEditingId(t.id)
		setMode('transaction')
		setForm({
			accountId: t.accountId,
			date: t.date,
			payee: t.payee ?? '',
			categoryId: t.categoryId ?? '',
			amount: centsToEuroInput(t.amountCents),
			direction: t.direction,
			notes: t.notes ?? '',
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
			setError('Account is required')
			return
		}
		if (!f.date || amountCents == null || Number.isNaN(amountCents) || amountCents <= 0) {
			setError('Date and amount (> 0) are required')
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
			setError('Source and destination accounts are required')
			return
		}
		if (f.fromAccountId === f.toAccountId) {
			setError('Source and destination must differ')
			return
		}
		if (!f.date || amountCents == null || Number.isNaN(amountCents) || amountCents <= 0) {
			setError('Date and amount (> 0) are required')
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

	async function remove(t: Transaction) {
		const msg = t.transferId
			? 'Delete this transfer? Both legs (inflow + outflow) will be removed.'
			: 'Delete transaction?'
		if (!confirm(msg)) {
			return
		}
		try {
			await api.transactions.remove(t.id)
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
				throw new Error('Name is required')
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
			'Delete category? Transactions keep their history (category set to none).',
			() => api.categories.remove(id),
			refetchCats,
		)
	}

	const isTransferLeg = (t: Transaction) => t.transferId != null

	// Medium audit: live client-side hint when source == destination.
	const transferSameAccount = () => {
		const f = transferForm()
		return f.fromAccountId !== '' && f.fromAccountId === f.toAccountId
	}

	return (
		<div class="page">
			<div class="page-header">
				<div>
					<h2 class="page-title">Transactions</h2>
					<p class="page-subtitle">
						Einnahmen, Ausgaben und Umbuchungen über alle Konten.
					</p>
				</div>
				<div class="inline-row">
					<button
						type="button"
						onClick={openTransfer}
						class="btn-ghost"
						disabled={(accounts()?.length ?? 0) < 2}
					>
						⇄ Transfer
					</button>
					<button
						type="button"
						onClick={openCreate}
						class="btn-primary"
						disabled={(accounts()?.length ?? 0) === 0}
					>
						+ Transaction
					</button>
				</div>
			</div>

			<Show when={(accounts()?.length ?? 0) === 0}>
				<p class="muted text-sm">Create an account first, then record transactions.</p>
			</Show>

			{/* Filters + totals */}
			<div class="card card--compact">
				<div class="form-grid">
					<label class="field">
						Account
						<select
							value={accountFilter()}
							onChange={(e) => setAccountFilter(e.currentTarget.value)}
							class="input"
						>
							<option value="">All accounts</option>
							<For each={accounts() ?? []}>
								{(a) => <option value={a.id}>{a.name}</option>}
							</For>
						</select>
					</label>
					<label class="field">
						Direction
						<select
							value={directionFilter()}
							onChange={(e) => setDirectionFilter(e.currentTarget.value)}
							class="input"
						>
							<option value="">All</option>
							<option value="inflow">Inflows (+)</option>
							<option value="outflow">Outflows (−)</option>
						</select>
					</label>
				</div>
				<div class="form-grid" style={{ 'margin-top': '0.75rem' }}>
					<label class="field">
						Search payee / notes
						<input
							value={query()}
							onInput={(e) => setQuery(e.currentTarget.value)}
							class="input"
							placeholder="e.g. REWE, salary…"
						/>
					</label>
				</div>
			</div>

			{/* Sticky summary bar: hits + totals + clear-filters */}
			<div class="txn-summary" role="status">
				<span class="txn-summary-stats">
					<span>
						{filtered().length} Treffer · Einnahmen {formatEUR(totals().inflow)} ·
						Ausgaben {formatEUR(totals().outflow)} · Netto{' '}
						<Amount
							cents={totals().net}
							direction={totals().net >= 0 ? 'inflow' : 'outflow'}
							showSign={false}
						/>
					</span>
				</span>
				<Show when={hasActiveFilters()}>
					<button type="button" onClick={clearFilters} class="btn-ghost">
						Filter löschen
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
					aria-label="Buchung erfassen"
				>
					<div class="segmented" role="tablist" aria-label="Erfassungsart">
						<button
							type="button"
							role="tab"
							aria-selected={mode() === 'transaction'}
							onClick={() => setMode('transaction')}
							class="segmented-tab"
							disabled={editingId() != null && mode() !== 'transaction'}
						>
							Buchung
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
									? 'Umbuchungen bestehen aus zwei verknüpften Buchungen und können nicht bearbeitet, nur gemeinsam gelöscht werden.'
									: 'Geld zwischen zwei Konten umbuchen'
							}
						>
							Umbuchung
						</button>
					</div>
					<Show when={editingId() != null}>
						<p class="muted text-sm">
							Umbuchung ist beim Bearbeiten deaktiviert: Umbuchungen können nicht
							bearbeitet, nur gemeinsam gelöscht werden.
						</p>
					</Show>

					<Show when={mode() === 'transaction'}>
						<form onSubmit={submitTxn} class="txn-subform">
							<div class="form-grid">
								<label class="field">
									Account
									<select
										value={form().accountId}
										onChange={(e) =>
											patchForm(setForm, 'accountId', e.currentTarget.value)
										}
										required
										class="input"
									>
										<option value="">— select</option>
										<For each={accounts() ?? []}>
											{(a) => <option value={a.id}>{a.name}</option>}
										</For>
									</select>
								</label>
								<label class="field" for="txn-date">
									Date
									<DateInput
										id="txn-date"
										value={form().date}
										onInput={(v) => patchForm(setForm, 'date', v)}
										required
									/>
								</label>
								<label class="field">
									Payee
									<input
										value={form().payee}
										onInput={(e) =>
											patchForm(setForm, 'payee', e.currentTarget.value)
										}
										class="input"
										placeholder="e.g. REWE, Employer…"
									/>
								</label>
								<label class="field">
									Category
									<select
										value={form().categoryId}
										onChange={(e) =>
											patchForm(setForm, 'categoryId', e.currentTarget.value)
										}
										class="input"
									>
										<option value="">— none</option>
										<For each={categories() ?? []}>
											{(c) => <option value={c.id}>{c.name}</option>}
										</For>
									</select>
								</label>
								<label class="field">
									Amount (€)
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
									Direction
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
										<option value="inflow">Inflow (+)</option>
										<option value="outflow">Outflow (−)</option>
									</select>
								</label>
							</div>
							<label class="field">
								Notes
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
									Abbrechen
								</button>
								<button type="submit" class="btn-primary">
									{editingId() ? 'Speichern' : 'Erstellen'}
								</button>
							</div>
						</form>
					</Show>

					<Show when={mode() === 'transfer'}>
						<form onSubmit={submitTransfer} class="txn-subform">
							<div class="form-grid">
								<label class="field">
									From account{' '}
									<span class="req" aria-hidden="true">
										*
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
										<option value="">— select</option>
										<For each={accounts() ?? []}>
											{(a) => <option value={a.id}>{a.name}</option>}
										</For>
									</select>
								</label>
								<label class="field">
									To account{' '}
									<span class="req" aria-hidden="true">
										*
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
										<option value="">— select</option>
										<For each={accounts() ?? []}>
											{(a) => <option value={a.id}>{a.name}</option>}
										</For>
									</select>
								</label>
								<label class="field">
									Amount (€)
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
									Date
									<DateInput
										id="transfer-date"
										value={transferForm().date}
										onInput={(v) => setTransferForm((p) => ({ ...p, date: v }))}
										required
									/>
								</label>
								<label class="field">
									Payee (optional)
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
									Category (optional)
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
										<option value="">— none</option>
										<For each={categories() ?? []}>
											{(c) => <option value={c.id}>{c.name}</option>}
										</For>
									</select>
								</label>
							</div>
							<Show when={transferSameAccount()}>
								<p id="transfer-accounts-hint" class="form-hint form-hint--error">
									Quelle und Ziel müssen unterschiedlich sein — bitte wähle zwei
									verschiedene Konten.
								</p>
							</Show>
							<label class="field">
								Notes
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
							<p class="muted text-sm">
								Erstellt zwei verknüpfte Buchungen (Ausgang + Eingang). Die Beine
								können nur gemeinsam gelöscht, nicht bearbeitet werden.
							</p>
							<Show when={error()}>
								<p class="form-error">{error()}</p>
							</Show>
							<div class="form-actions">
								<button
									type="button"
									onClick={() => setShowForm(false)}
									class="btn-ghost"
								>
									Abbrechen
								</button>
								<button
									type="submit"
									class="btn-primary"
									disabled={transferSameAccount()}
								>
									Umbuchung erstellen
								</button>
							</div>
						</form>
					</Show>
				</div>
			</Show>

			<Show when={transactions.loading}>
				<p class="muted">Loading…</p>
			</Show>
			<Show when={transactions.error}>
				<p class="form-error">Error: {(transactions.error as Error).message}</p>
			</Show>

			{/* Medium audit: `ledger` tightens rows on desktop via CSS only. */}
			<div class="list list--tight ledger">
				<For each={filtered()}>
					{(t) => {
						const cat = () => categoryOf(categories(), t.categoryId)
						return (
							<div class="card card--compact card-row">
								<div>
									<div class="title">
										{t.payee || <span class="subtle">— no payee —</span>}{' '}
										<Show when={isTransferLeg(t)}>
											<span
												class="subtle text-sm"
												title={`Transfer ${t.transferId}`}
											>
												⇄ transfer
											</span>
										</Show>
									</div>
									<div class="muted text-sm">
										{formatDateISO(t.date)} ·{' '}
										{accountName(accounts(), t.accountId)}
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
										<Show when={t.notes}> · {t.notes}</Show>
									</div>
								</div>
								<div class="card-actions">
									<Amount cents={t.amountCents} direction={t.direction} />
									<Show
										when={!isTransferLeg(t)}
										fallback={
											<button
												type="button"
												onClick={() => remove(t)}
												class="btn-icon btn-icon--danger"
												aria-label="Delete transfer"
												title="Delete transfer (both legs)"
											>
												✕
											</button>
										}
									>
										<CrudRow
											onEdit={() => openEdit(t)}
											onDelete={() => remove(t)}
										/>
									</Show>
								</div>
							</div>
						)
					}}
				</For>
				<Show when={filtered().length === 0 && !transactions.loading}>
					<EmptyState actionLabel="Transaktion hinzufügen" onAction={openCreate}>
						Keine Buchungen gefunden. Erfasse Einnahmen und Ausgaben oder lege eine
						Umbuchung zwischen Konten an.
					</EmptyState>
				</Show>
			</div>

			{/* Categories */}
			<div class="page-header" style={{ 'margin-top': '1rem' }}>
				<h2 class="page-title">Categories</h2>
				<button type="button" onClick={openCatCreate} class="btn-ghost">
					+ Category
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
						Name
						<input
							value={catForm().name}
							onInput={(e) => patchForm(setCatForm, 'name', e.currentTarget.value)}
							required
							class="input"
							placeholder="e.g. Groceries, Salary"
						/>
					</label>
					<label class="field">
						Kind
						<select
							value={catForm().kind}
							onChange={(e) => patchForm(setCatForm, 'kind', e.currentTarget.value)}
							class="input"
						>
							<option value="">Both</option>
							<option value="income">Income</option>
							<option value="expense">Expense</option>
						</select>
					</label>
					<label class="field">
						Color
						<input
							type="color"
							value={catForm().color}
							onInput={(e) => patchForm(setCatForm, 'color', e.currentTarget.value)}
							class="color-swatch"
							aria-label="Kategoriefarbe"
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
								<span class="muted text-sm">· {c.kind ?? 'both'}</span>
							</div>
							<CrudRow
								onEdit={() => openCatEdit(c)}
								onDelete={() => removeCat(c.id)}
							/>
						</div>
					)}
				</For>
				<Show when={(categories() ?? []).length === 0 && !categories.loading}>
					<EmptyState actionLabel="Kategorie hinzufügen" onAction={openCatCreate}>
						Keine Kategorien. Lege z. B. Lebensmittel, Gehalt oder Miete an.
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
