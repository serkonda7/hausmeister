import { createMemo, createResource, For, Show } from 'solid-js'
import { api, type FinanceEvent } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatDateISO, formatMonthKey, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import Amount from './Amount'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'

export default function Events() {
	const [events, { refetch }] = createResource(() => api.events.list())
	const [accounts] = createResource(() => api.accounts.list())
	const [pools] = createResource(() => api.pools.list())

	const sortedEvents = createMemo(() =>
		(events() ?? []).slice().sort((a, b) => b.date.localeCompare(a.date)),
	)

	/** Newest first, grouped by month for a scannable timeline. */
	const groupedEvents = createMemo(() => {
		const groups: Array<{
			key: string
			label: string
			items: FinanceEvent[]
		}> = []
		for (const ev of sortedEvents()) {
			const key = ev.date.slice(0, 7)
			let g = groups.find((x) => x.key === key)
			if (!g) {
				g = { key, label: formatMonthKey(key), items: [] }
				groups.push(g)
			}
			g.items.push(ev)
		}
		return groups
	})

	const crud = useCrudForm<
		{
			title: string
			amount: string
			direction: 'inflow' | 'outflow'
			date: string
			isRecurring: boolean
			frequency: string
			recurringUntil: string
			poolId: string
			accountId: string
			notes: string
		},
		string
	>({
		title: '',
		amount: '',
		direction: 'outflow',
		date: todayISO(),
		isRecurring: false,
		frequency: '',
		recurringUntil: '',
		poolId: '',
		accountId: '',
		notes: '',
	})
	const form = crud.form
	const setForm = crud.setForm

	function openCreate() {
		crud.openCreate({
			title: '',
			amount: '',
			direction: 'outflow',
			date: todayISO(),
			isRecurring: false,
			frequency: '',
			recurringUntil: '',
			poolId: '',
			accountId: '',
			notes: '',
		})
	}
	function openEdit(id: string) {
		const ev = events()?.find((x) => x.id === id)
		if (!ev) {
			return
		}
		crud.openEdit(id, {
			title: ev.title,
			amount: centsToEuroInput(ev.amountCents),
			direction: ev.direction,
			date: ev.date,
			isRecurring: ev.isRecurring,
			frequency: ev.frequency ?? '',
			recurringUntil: ev.recurringUntil ?? '',
			poolId: ev.poolId ?? '',
			accountId: ev.accountId ?? '',
			notes: ev.notes ?? '',
		})
	}

	function submit(e: Event) {
		return crud.submit(e, async () => {
			const f = form()
			const amountCents = parseEuroToCents(f.amount)
			if (!f.title || amountCents == null || Number.isNaN(amountCents)) {
				throw new Error(t().events.required)
			}
			const payload: Omit<FinanceEvent, 'id' | 'createdAt'> = {
				title: f.title,
				amountCents,
				direction: f.direction,
				date: f.date,
				isRecurring: f.isRecurring,
				frequency: (f.frequency || null) as FinanceEvent['frequency'],
				recurringUntil: f.recurringUntil || null,
				poolId: f.poolId || null,
				accountId: f.accountId || null,
				notes: f.notes || null,
			}
			const eid = crud.editing()
			if (eid) {
				await api.events.update(eid, payload)
			} else {
				await api.events.create(payload)
			}
			await refetch()
		})
	}

	function remove(id: string) {
		return removeWithConfirm(t().events.confirmDelete, () => api.events.remove(id), refetch)
	}

	function frequencyLabel(value: string): string {
		const d = t().events
		switch (value) {
			case 'weekly':
				return d.weekly
			case 'biweekly':
				return d.biweekly
			case 'monthly':
				return d.monthly
			case 'quarterly':
				return d.quarterly
			case 'yearly':
				return d.yearly
			default:
				return value
		}
	}

	return (
		<div class="page">
			<div class="page-header">
				<div>
					<h2 class="page-title">{t().events.title}</h2>
				</div>
				<button type="button" onClick={openCreate} class="btn-primary">
					{t().events.add}
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
						<span class="field-label">
							{t().events.titleField}{' '}
							<span class="req" aria-hidden="true">
								*
							</span>
						</span>
						<input
							value={form().title}
							onInput={(e) => patchForm(setForm, 'title', e.currentTarget.value)}
							required
							aria-required="true"
							class="input"
						/>
					</label>
					<label class="field">
						<span class="field-label">
							{t().events.amount}{' '}
							<span class="req" aria-hidden="true">
								*
							</span>
						</span>
						<input
							type="number"
							step="0.01"
							value={form().amount}
							onInput={(e) => patchForm(setForm, 'amount', e.currentTarget.value)}
							required
							aria-required="true"
							class="input"
						/>
					</label>
					<label class="field">
						{t().events.direction}
						<select
							value={form().direction}
							onChange={(e) =>
								patchForm(
									setForm,
									'direction',
									e.currentTarget.value as FinanceEvent['direction'],
								)
							}
							class="input"
						>
							<option value="inflow">{t().events.inflow}</option>
							<option value="outflow">{t().events.outflow}</option>
						</select>
					</label>
					<label class="field" for="ev-date">
						<span class="field-label">
							{t().events.date}{' '}
							<span class="req" aria-hidden="true">
								*
							</span>
						</span>
						<DateInput
							id="ev-date"
							value={form().date}
							onInput={(v) => patchForm(setForm, 'date', v)}
							required
						/>
					</label>
					<label class="field field--checkbox">
						<input
							type="checkbox"
							checked={form().isRecurring}
							onChange={(e) =>
								patchForm(setForm, 'isRecurring', e.currentTarget.checked)
							}
						/>{' '}
						{t().events.recurring}
					</label>
					<Show when={form().isRecurring}>
						<label class="field">
							{t().events.frequency}
							<select
								value={form().frequency}
								onChange={(e) =>
									patchForm(setForm, 'frequency', e.currentTarget.value)
								}
								class="input"
							>
								<option value="">{t().common.select}</option>
								<option value="weekly">{t().events.weekly}</option>
								<option value="biweekly">{t().events.biweekly}</option>
								<option value="monthly">{t().events.monthly}</option>
								<option value="quarterly">{t().events.quarterly}</option>
								<option value="yearly">{t().events.yearly}</option>
							</select>
						</label>
						<label class="field" for="ev-recurring-until">
							{t().events.until}{' '}
							<DateInput
								id="ev-recurring-until"
								value={form().recurringUntil}
								onInput={(v) => patchForm(setForm, 'recurringUntil', v)}
							/>
						</label>
					</Show>
					<label class="field">
						{t().events.poolOptional}
						<select
							value={form().poolId}
							onChange={(e) => patchForm(setForm, 'poolId', e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().events.noPool}</option>
							<For each={pools() ?? []}>
								{(p) => <option value={p.id}>{p.name}</option>}
							</For>
						</select>
					</label>
					<label class="field">
						{t().events.accountOptional}
						<select
							value={form().accountId}
							onChange={(e) => patchForm(setForm, 'accountId', e.currentTarget.value)}
							class="input"
						>
							<option value="">{t().events.noAccount}</option>
							<For each={accounts() ?? []}>
								{(a) => <option value={a.id}>{a.name}</option>}
							</For>
						</select>
					</label>
				</div>
				<label class="field">
					{t().events.notes}{' '}
					<input
						value={form().notes}
						onInput={(e) => patchForm(setForm, 'notes', e.currentTarget.value)}
						class="input"
					/>
				</label>
			</CrudForm>

			<div class="list list--tight">
				<For each={groupedEvents()}>
					{(g) => (
						<>
							<h3 class="month-heading">{g.label}</h3>
							<For each={g.items}>
								{(ev) => (
									<div class="card card--compact card-row">
										<div>
											<div class="title">{ev.title}</div>
											<div class="muted text-sm">
												{formatDateISO(ev.date)}{' '}
												<Show when={ev.isRecurring}>
													·{' '}
													{ev.frequency
														? frequencyLabel(ev.frequency)
														: ''}{' '}
													↻
												</Show>{' '}
												<Show when={ev.recurringUntil}>
													{' '}
													{t().events.untilPrefix}{' '}
													{ev.recurringUntil
														? formatDateISO(ev.recurringUntil)
														: ''}
												</Show>
											</div>
										</div>
										<div class="card-actions">
											<Amount
												cents={ev.amountCents}
												direction={ev.direction}
											/>
											<CrudRow
												onEdit={() => openEdit(ev.id)}
												onDelete={() => remove(ev.id)}
											/>
										</div>
									</div>
								)}
							</For>
						</>
					)}
				</For>
				<Show when={(events() ?? []).length === 0 && !events.loading}>
					<EmptyState>{t().events.empty}</EmptyState>
				</Show>
			</div>
		</div>
	)
}
