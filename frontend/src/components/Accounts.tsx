import { createMemo, createResource, For, Show } from 'solid-js'
import { type Account, api } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { accountTypeDescriptions, accountTypeLabels, formatDateISO, formatEUR } from '../lib/format'
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
				throw new Error('Ungültiger Anfangssaldo')
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
		return removeWithConfirm('Wirklich löschen?', () => api.accounts.remove(id), refetch)
	}

	return (
		<div class="page">
			<div class="page-header">
				<div>
					<h2 class="page-title">Konten</h2>
					<p class="page-subtitle">
						{(accounts() ?? []).length} Konten · Giro, Sparkonten, Depots und mehr im
						Überblick.
					</p>
				</div>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Konto
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
						Name{' '}
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
						Typ
						<select
							value={form().type}
							onChange={(e) =>
								patchForm(setForm, 'type', e.currentTarget.value as Account['type'])
							}
							class="input"
							title={accountTypeDescriptions[form().type] ?? ''}
						>
							<For each={Object.entries(accountTypeLabels)}>
								{([k, v]) => (
									<option value={k} title={accountTypeDescriptions[k] ?? ''}>
										{v}
									</option>
								)}
							</For>
						</select>
					</label>
					<label class="field">
						Institut{' '}
						<input
							value={form().institution}
							onInput={(e) =>
								patchForm(setForm, 'institution', e.currentTarget.value)
							}
							class="input"
							list="institution-options"
							placeholder="Institut wählen oder neu eingeben"
							autocomplete="off"
						/>
						<datalist id="institution-options">
							<For each={institutions()}>{(name) => <option value={name} />}</For>
						</datalist>
					</label>
					<label class="field" for="account-opening-date">
						Eröffnungsdatum{' '}
						<DateInput
							id="account-opening-date"
							value={form().openingDate}
							onInput={(v) => patchForm(setForm, 'openingDate', v)}
						/>
					</label>
					<label class="field">
						Anfangssaldo (€){' '}
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
						IBAN{' '}
						<input
							value={form().iban}
							onInput={(e) => patchForm(setForm, 'iban', e.currentTarget.value)}
							class="input"
						/>
					</label>
				</div>
				<label class="field">
					Notizen{' '}
					<input
						value={form().notes}
						onInput={(e) => patchForm(setForm, 'notes', e.currentTarget.value)}
						class="input"
					/>
				</label>
			</CrudForm>

			<Show when={accounts.loading}>
				<p class="muted">Lädt…</p>
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
										<span
											class="subtle"
											title={accountTypeDescriptions[a.type] ?? ''}
										>
											· {accountTypeLabels[a.type]}
										</span>
									</div>
									<div class="muted text-sm">
										{a.institution ?? '—'}
										<Show when={a.iban}> · {a.iban}</Show>
										<Show when={a.openingDate}>
											{' '}
											· eröffnet {formatDateISO(a.openingDate ?? '')}
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
													Frei {formatEUR(bal().unallocatedCents)}
													<Show when={a.openingBalanceCents != null}>
														{' '}
														· Start{' '}
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
					<EmptyState>Keine Konten. Erstelle dein erstes Konto.</EmptyState>
				</Show>
			</div>
		</div>
	)
}
