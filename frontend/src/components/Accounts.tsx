import { createMemo, createResource, For, Show } from 'solid-js'
import { type Account, api } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { accountTypeDescription, accountTypeLabel, formatEUR } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import './Accounts.css'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'
import Field, { SelectField, TextField } from './Field'
import ListState from './ListState'
import PageHeader from './PageHeader'

type AccountForm = {
	name: string
	type: Account['type']
	institution: string
	openingDate: string
	openingBalance: string
	iban: string
	notes: string
}

const EMPTY_FORM: AccountForm = {
	name: '',
	type: 'checking',
	institution: '',
	openingDate: '',
	openingBalance: '',
	iban: '',
	notes: '',
}

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
	const crud = useCrudForm<AccountForm, Account>({ ...EMPTY_FORM })
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
		crud.openCreate({ ...EMPTY_FORM })
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
		'crypto',
		'other',
	]

	return (
		<div class="page">
			<PageHeader
				title={t().accounts.title}
				actions={
					<button type="button" onClick={openCreate} class="btn-primary">
						{t().accounts.add}
					</button>
				}
			/>

			<CrudForm
				open={crud.showForm()}
				error={crud.error()}
				editing={crud.editing()}
				onSubmit={submit}
				onCancel={crud.close}
			>
				<div class="form-grid">
					<TextField
						label={t().accounts.name}
						required
						value={form().name}
						onInput={(v) => patchForm(setForm, 'name', v)}
					/>
					<SelectField
						label={t().accounts.type}
						value={form().type}
						onChange={(v) => patchForm(setForm, 'type', v as Account['type'])}
						title={accountTypeDescription(form().type)}
					>
						<For each={accountTypes}>
							{(k) => (
								<option value={k} title={accountTypeDescription(k)}>
									{accountTypeLabel(k)}
								</option>
							)}
						</For>
					</SelectField>
					<Field label={t().accounts.institution}>
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
					</Field>
					<Field label={t().accounts.openingDate} for="account-opening-date">
						<DateInput
							id="account-opening-date"
							value={form().openingDate}
							onInput={(v) => patchForm(setForm, 'openingDate', v)}
						/>
					</Field>
					<TextField
						label={t().accounts.openingBalance}
						type="number"
						step="0.01"
						value={form().openingBalance}
						onInput={(v) => patchForm(setForm, 'openingBalance', v)}
					/>
					<TextField
						label={t().accounts.iban}
						value={form().iban}
						onInput={(v) => patchForm(setForm, 'iban', v)}
					/>
				</div>
				<TextField
					label={t().accounts.notes}
					value={form().notes}
					onInput={(v) => patchForm(setForm, 'notes', v)}
				/>
			</CrudForm>

			<ListState loading={accounts.loading} />

			<Show when={(accounts() ?? []).length > 0 && !accounts.loading}>
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr>
								<th scope="col">{t().accounts.name}</th>
								<th scope="col">{t().accounts.type}</th>
								<th scope="col">{t().accounts.institution}</th>
								<th scope="col">{t().accounts.iban}</th>
								<th scope="col" class="num">
									{t().accounts.balance}
								</th>
								<th scope="col" class="cell-actions">
									<span class="sr-only">
										{t().common.edit} / {t().common.delete}
									</span>
								</th>
							</tr>
						</thead>
						<tbody>
							<For each={accounts() ?? []}>
								{(a) => {
									const b = () => balances().get(a.id)
									return (
										<tr>
											<td class="cell-main">{a.name}</td>
											<td title={accountTypeDescription(a.type)}>
												{accountTypeLabel(a.type)}
											</td>
											<td>{a.institution ?? t().common.dash}</td>
											<td>{a.iban ?? t().common.dash}</td>
											<td class="num strong--bold">
												<Show
													when={b()}
													fallback={
														a.openingBalanceCents != null
															? formatEUR(a.openingBalanceCents)
															: t().common.dash
													}
												>
													{(bal) => formatEUR(bal().currentCents)}
												</Show>
											</td>
											<td class="cell-actions">
												<CrudRow
													onEdit={() => openEdit(a)}
													onDelete={() => remove(a.id)}
												/>
											</td>
										</tr>
									)
								}}
							</For>
						</tbody>
					</table>
				</div>
			</Show>
			<Show when={(accounts() ?? []).length === 0 && !accounts.loading}>
				<EmptyState>{t().accounts.empty}</EmptyState>
			</Show>
		</div>
	)
}
