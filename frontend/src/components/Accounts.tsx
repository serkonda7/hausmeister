import { createMemo, createResource, For, Show } from 'solid-js'
import { type Account, api } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { accountTypeDescription, accountTypeLabel, formatDateISO, formatEUR } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'

export default function Accounts() {
	const [accounts, { refetch }] = createResource(() => api.accounts.list())
	const [summary] = createResource(() => api.summary())

	const balances = createMemo(() => {
		const map = new Map<string, { currentCents: number; unallocatedCents: number }>()
		for (const b of summary()?.accountBalances ?? []) {
			map.set(b.accountId, {
				currentCents: b.currentCents,
				unallocatedCents: b.unallocatedCents,
			})
		}
		return map
	})
	const crud = useCrudForm<
		{
			name: string
			type: Account['type']
			institution: string
			openingDate: string
			openingBalance: string
			iban: string
			notes: string
		},
		Account
	>({
		name: '',
		type: 'checking',
		institution: '',
		openingDate: '',
		openingBalance: '',
		iban: '',
		notes: '',
	})
	const form = crud.form
	const setForm = crud.setForm

	const institutions = createMemo(() => {
		const seen = new Set<string>()
		for (const a of accounts() ?? []) {
			const name = a.institution?.trim()
			if (name) {
				seen.add(name)
			}
		}
		return [...seen].sort((x, y) => x.localeCompare(y))
	})

	function openCreate() {
		crud.openCreate({
			name: '',
			type: 'checking',
			institution: '',
			openingDate: '',
			openingBalance: '',
			iban: '',
			notes: '',
		})
	}
	function openEdit(a: Account) {
		crud.openEdit(a, {
			name: a.name,
			type: a.type,
			institution: a.institution ?? '',
			openingDate: a.openingDate ?? '',
			openingBalance: centsToEuroInput(a.openingBalanceCents),
			iban: a.iban ?? '',
			notes: a.notes ?? '',
		})
	}

	function submit(e: Event) {
		return crud.submit(e, async () => {
			const f = form()
			const openingBalanceCents = parseEuroToCents(f.openingBalance)
			if (openingBalanceCents !== null && Number.isNaN(openingBalanceCents)) {
				throw new Error(t().accounts.invalidOpening)
			}
			const payload: Omit<Account, 'id' | 'createdAt'> = {
				name: f.name,
				type: f.type,
				institution: f.institution.trim() || null,
				openingDate: f.openingDate || null,
				openingBalanceCents,
				iban: f.iban.trim() || null,
				notes: f.notes || null,
			}
			const current = crud.editing()
			if (current) {
				await api.accounts.update(current.id, payload)
			} else {
				await api.accounts.create(payload)
			}
			await refetch()
		})
	}

	function remove(id: string) {
		return removeWithConfirm(t().accounts.confirmDelete, () => api.accounts.remove(id), refetch)
	}

	const accountTypes: Array<Account['type']> = [
		'checking',
		'savings',
		'broker',
		'cash',
		'crypto',
		'festgeld',
		'other',
	]

	return (
		<div class="page">
			<div class="page-header">
				<div>
					<h2 class="page-title">{t().accounts.title}</h2>
					<p class="page-subtitle">
						{(accounts() ?? []).length} {t().accounts.subtitleSuffix}
					</p>
				</div>
				<button type="button" onClick={openCreate} class="btn-primary">
					{t().accounts.add}
				</button>
			</div>

			<CrudForm
				open={crud.showForm()}
				error={crud.error()}
				editing={crud.editing()}
				onSubmit={submit}
				onCancel={crud.close}
			>
				<div class="form-grid">
					<label class="field">
						{t().accounts.name}{' '}
						<span class="req" aria-hidden="true">
							*
						</span>
						<input
							value={form().name}
							onInput={(e) => patchForm(setForm, 'name', e.currentTarget.value)}
							required
							aria-required="true"
							class="input"
						/>
					</label>
					<label class="field">
						{t().accounts.type}
						<select
							value={form().type}
							onChange={(e) =>
								patchForm(setForm, 'type', e.currentTarget.value as Account['type'])
							}
							class="input"
							title={accountTypeDescription(form().type)}
						>
							<For each={accountTypes}>
								{(k) => (
									<option value={k} title={accountTypeDescription(k)}>
										{accountTypeLabel(k)}
									</option>
								)}
							</For>
						</select>
					</label>
					<label class="field">
						{t().accounts.institution}{' '}
						<input
							value={form().institution}
							onInput={(e) =>
								patchForm(setForm, 'institution', e.currentTarget.value)
							}
							class="input"
							list="institution-options"
							placeholder={t().accounts.institutionPlaceholder}
							autocomplete="off"
						/>
						<datalist id="institution-options">
							<For each={institutions()}>{(name) => <option value={name} />}</For>
						</datalist>
					</label>
					<label class="field" for="account-opening-date">
						{t().accounts.openingDate}{' '}
						<DateInput
							id="account-opening-date"
							value={form().openingDate}
							onInput={(v) => patchForm(setForm, 'openingDate', v)}
						/>
					</label>
					<label class="field">
						{t().accounts.openingBalance}{' '}
						<input
							type="number"
							step="0.01"
							value={form().openingBalance}
							onInput={(e) =>
								patchForm(setForm, 'openingBalance', e.currentTarget.value)
							}
							class="input"
						/>
					</label>
					<label class="field">
						{t().accounts.iban}{' '}
						<input
							value={form().iban}
							onInput={(e) => patchForm(setForm, 'iban', e.currentTarget.value)}
							class="input"
						/>
					</label>
				</div>
				<label class="field">
					{t().accounts.notes}{' '}
					<input
						value={form().notes}
						onInput={(e) => patchForm(setForm, 'notes', e.currentTarget.value)}
						class="input"
					/>
				</label>
			</CrudForm>

			<Show when={accounts.loading}>
				<p class="muted">{t().common.loading}</p>
			</Show>

			<div class="list">
				<For each={accounts() ?? []}>
					{(a) => {
						const b = () => balances().get(a.id)
						return (
							<div class="card card-row">
								<div>
									<div class="strong">
										{a.name}{' '}
										<span class="subtle" title={accountTypeDescription(a.type)}>
											· {accountTypeLabel(a.type)}
										</span>
									</div>
									<div class="muted text-sm">
										{a.institution ?? '—'}
										<Show when={a.iban}> · {a.iban}</Show>
										<Show when={a.openingDate}>
											{' '}
											· {t().accounts.opened}{' '}
											{formatDateISO(a.openingDate ?? '')}
										</Show>
									</div>
								</div>
								<div class="card-actions">
									<div style={{ 'text-align': 'right' }}>
										<div
											class="strong--bold"
											style={{ 'white-space': 'nowrap' }}
										>
											<Show
												when={b()}
												fallback={
													a.openingBalanceCents != null
														? formatEUR(a.openingBalanceCents)
														: '—'
												}
											>
												{(bal) => formatEUR(bal().currentCents)}
											</Show>
										</div>
										<Show when={b()}>
											{(bal) => (
												<div
													class="muted text-sm"
													style={{ 'white-space': 'nowrap' }}
												>
													{t().accounts.free}{' '}
													{formatEUR(bal().unallocatedCents)}
													<Show when={a.openingBalanceCents != null}>
														{' '}
														· {t().accounts.start}{' '}
														{formatEUR(a.openingBalanceCents ?? 0)}
													</Show>
												</div>
											)}
										</Show>
									</div>
									<CrudRow
										onEdit={() => openEdit(a)}
										onDelete={() => remove(a.id)}
									/>
								</div>
							</div>
						)
					}}
				</For>
				<Show when={(accounts() ?? []).length === 0 && !accounts.loading}>
					<EmptyState>{t().accounts.empty}</EmptyState>
				</Show>
			</div>
		</div>
	)
}
