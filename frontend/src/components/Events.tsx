import { createMemo, createResource, For, Show } from 'solid-js'
import { api, type FinanceEvent } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatDateISO, formatMonthKey, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import Amount from './Amount'
import CrudForm from './CrudForm'
import DateInput from './DateInput'
import EmptyState from './EmptyState'
import EntityCard from './EntityCard'
import Field, { SelectField, TextField } from './Field'
import PageHeader from './PageHeader'

type EventForm = {
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
}

function emptyEventForm(): EventForm {
	return {
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
	}
}

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

	const crud = useCrudForm<EventForm, string>(emptyEventForm())
	const form = crud.form
	const setForm = crud.setForm

	function openCreate() {
		crud.openCreate(emptyEventForm())
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
		return (t().events as Record<string, string>)[value] ?? value
	}

	return (
		<div class="page">
			<PageHeader
				title={t().events.title}
				actions={
					<button type="button" onClick={openCreate} class="btn-primary">
						{t().events.add}
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
						label={t().events.titleField}
						required
						value={form().title}
						onInput={(v) => patchForm(setForm, 'title', v)}
					/>
					<TextField
						label={t().events.amount}
						required
						type="number"
						step="0.01"
						value={form().amount}
						onInput={(v) => patchForm(setForm, 'amount', v)}
					/>
					<SelectField
						label={t().events.direction}
						value={form().direction}
						onChange={(v) =>
							patchForm(setForm, 'direction', v as FinanceEvent['direction'])
						}
					>
						<option value="inflow">{t().events.inflow}</option>
						<option value="outflow">{t().events.outflow}</option>
					</SelectField>
					<Field label={t().events.date} required for="ev-date">
						<DateInput
							id="ev-date"
							value={form().date}
							onInput={(v) => patchForm(setForm, 'date', v)}
							required
						/>
					</Field>
					<Field checkbox label={t().events.recurring}>
						<input
							type="checkbox"
							checked={form().isRecurring}
							onChange={(e) =>
								patchForm(setForm, 'isRecurring', e.currentTarget.checked)
							}
						/>
					</Field>
					<Show when={form().isRecurring}>
						<SelectField
							label={t().events.frequency}
							value={form().frequency}
							onChange={(v) => patchForm(setForm, 'frequency', v)}
						>
							<option value="">{t().common.select}</option>
							<option value="weekly">{t().events.weekly}</option>
							<option value="biweekly">{t().events.biweekly}</option>
							<option value="monthly">{t().events.monthly}</option>
							<option value="quarterly">{t().events.quarterly}</option>
							<option value="yearly">{t().events.yearly}</option>
						</SelectField>
						<Field label={t().events.until} for="ev-recurring-until">
							<DateInput
								id="ev-recurring-until"
								value={form().recurringUntil}
								onInput={(v) => patchForm(setForm, 'recurringUntil', v)}
							/>
						</Field>
					</Show>
					<SelectField
						label={t().events.poolOptional}
						value={form().poolId}
						onChange={(v) => patchForm(setForm, 'poolId', v)}
					>
						<option value="">{t().events.noPool}</option>
						<For each={pools() ?? []}>
							{(p) => <option value={p.id}>{p.name}</option>}
						</For>
					</SelectField>
					<SelectField
						label={t().events.accountOptional}
						value={form().accountId}
						onChange={(v) => patchForm(setForm, 'accountId', v)}
					>
						<option value="">{t().events.noAccount}</option>
						<For each={accounts() ?? []}>
							{(a) => <option value={a.id}>{a.name}</option>}
						</For>
					</SelectField>
				</div>
				<TextField
					label={t().events.notes}
					value={form().notes}
					onInput={(v) => patchForm(setForm, 'notes', v)}
				/>
			</CrudForm>

			<div class="list list--tight">
				<For each={groupedEvents()}>
					{(g) => (
						<>
							<h3 class="month-heading">{g.label}</h3>
							<For each={g.items}>
								{(ev) => (
									<EntityCard
										title={ev.title}
										meta={
											<>
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
											</>
										}
										amount={
											<Amount
												cents={ev.amountCents}
												direction={ev.direction}
											/>
										}
										onEdit={() => openEdit(ev.id)}
										onDelete={() => remove(ev.id)}
									/>
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
