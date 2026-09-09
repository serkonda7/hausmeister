import { createMemo, createResource, For, Show } from 'solid-js'
import { api, type FinanceEvent } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatDateISO, todayISO } from '../lib/format'
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
		(events() ?? []).slice().sort((a, b) => a.date.localeCompare(b.date)),
	)

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
				throw new Error('Title and amount are required')
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
		return removeWithConfirm('Delete event?', () => api.events.remove(id), refetch)
	}

	return (
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Timeline</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Event
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
							Title{' '}
							<input
								value={form().title}
								onInput={(e) => patchForm(setForm, 'title', e.currentTarget.value)}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Amount (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().amount}
								onInput={(e) => patchForm(setForm, 'amount', e.currentTarget.value)}
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
										e.currentTarget.value as FinanceEvent['direction'],
									)
								}
								class="input"
							>
								<option value="inflow">Inflow (+)</option>
								<option value="outflow">Outflow (−)</option>
							</select>
						</label>
						<label class="field" for="ev-date">
							Date{' '}
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
							Recurring
						</label>
						<Show when={form().isRecurring}>
							<label class="field">
								Frequency
								<select
									value={form().frequency}
									onChange={(e) =>
										patchForm(setForm, 'frequency', e.currentTarget.value)
									}
									class="input"
								>
									<option value="">— select</option>
									<option value="weekly">Weekly</option>
									<option value="biweekly">Every 2 weeks</option>
									<option value="monthly">Monthly</option>
									<option value="quarterly">Quarterly</option>
									<option value="yearly">Yearly</option>
								</select>
							</label>
							<label class="field" for="ev-recurring-until">
								Until (date){' '}
								<DateInput
									id="ev-recurring-until"
									value={form().recurringUntil}
									onInput={(v) => patchForm(setForm, 'recurringUntil', v)}
								/>
							</label>
						</Show>
						<label class="field">
							Pool (optional)
							<select
								value={form().poolId}
								onChange={(e) =>
									patchForm(setForm, 'poolId', e.currentTarget.value)
								}
								class="input"
							>
								<option value="">— no pool</option>
								<For each={pools() ?? []}>
									{(p) => <option value={p.id}>{p.name}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Account (optional)
							<select
								value={form().accountId}
								onChange={(e) =>
									patchForm(setForm, 'accountId', e.currentTarget.value)
								}
								class="input"
							>
								<option value="">— no account</option>
								<For each={accounts() ?? []}>
									{(a) => <option value={a.id}>{a.name}</option>}
								</For>
							</select>
						</label>
					</div>
					<label class="field">
						Notes{' '}
						<input
							value={form().notes}
							onInput={(e) => patchForm(setForm, 'notes', e.currentTarget.value)}
							class="input"
						/>
					</label>
			</CrudForm>

			<div class="list list--tight">
				<For each={sortedEvents()}>
					{(ev) => (
						<div class="card card--compact card-row">
							<div>
								<div class="title">{ev.title}</div>
								<div class="muted text-sm">
									{formatDateISO(ev.date)}{' '}
									<Show when={ev.isRecurring}>· {ev.frequency} ↻</Show>{' '}
									<Show when={ev.recurringUntil}>
										{' '}
										until{' '}
										{ev.recurringUntil ? formatDateISO(ev.recurringUntil) : ''}
									</Show>
								</div>
							</div>
							<div class="card-actions">
								<Amount cents={ev.amountCents} direction={ev.direction} />
								<CrudRow
									onEdit={() => openEdit(ev.id)}
									onDelete={() => remove(ev.id)}
								/>
							</div>
						</div>
					)}
				</For>
				<Show when={(events() ?? []).length === 0 && !events.loading}>
					<EmptyState>
						No events. Create e.g. salary (monthly inflow) or rent (monthly
						outflow).
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
