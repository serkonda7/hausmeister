import { IconPencil, IconTrash } from '@tabler/icons-solidjs'
import { createResource, createSignal, For, Show } from 'solid-js'
import { api } from '../lib/api'
import { formatDateISO, formatEUR } from '../lib/format'
import './Events.css'

export default function Events() {
	const [events, { refetch }] = createResource(() => api.events.list())
	const [accounts] = createResource(() => api.accounts.list())
	const [pools] = createResource(() => api.pools.list())

	const [showForm, setShowForm] = createSignal(false)
	const [editingId, setEditingId] = createSignal<string | null>(null)
	const [error, setError] = createSignal('')
	const [form, setForm] = createSignal({
		title: '',
		amount: '',
		direction: 'outflow' as 'inflow' | 'outflow',
		date: new Date().toISOString().slice(0, 10),
		isRecurring: false,
		frequency: '' as string,
		recurringUntil: '',
		poolId: '' as string,
		accountId: '' as string,
		notes: '',
	})

	function openCreate() {
		setEditingId(null)
		setForm({
			title: '',
			amount: '',
			direction: 'outflow',
			date: new Date().toISOString().slice(0, 10),
			isRecurring: false,
			frequency: '',
			recurringUntil: '',
			poolId: '',
			accountId: '',
			notes: '',
		})
		setError('')
		setShowForm(true)
	}
	function openEdit(id: string) {
		const ev = events()?.find((x) => x.id === id)
		if (!ev) {
			return
		}
		setEditingId(id)
		setForm({
			title: ev.title,
			amount: (ev.amountCents / 100).toString(),
			direction: ev.direction,
			date: ev.date,
			isRecurring: ev.isRecurring,
			frequency: ev.frequency ?? '',
			recurringUntil: ev.recurringUntil ?? '',
			poolId: ev.poolId ?? '',
			accountId: ev.accountId ?? '',
			notes: ev.notes ?? '',
		})
		setError('')
		setShowForm(true)
	}

	async function submit(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const amountCents = Math.round(Number.parseFloat(f.amount || '0') * 100)
		if (!f.title || Number.isNaN(amountCents)) {
			setError('Titel und Betrag erforderlich')
			return
		}
		const payload: Record<string, unknown> = {
			title: f.title,
			amountCents,
			direction: f.direction,
			date: f.date,
			isRecurring: f.isRecurring,
			frequency: f.frequency || undefined,
			recurringUntil: f.recurringUntil || undefined,
			poolId: f.poolId || undefined,
			accountId: f.accountId || undefined,
			notes: f.notes || undefined,
		}
		try {
			const eid = editingId()
			if (eid) {
				await api.events.update(eid, payload as never)
			} else {
				await api.events.create(payload as never)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function remove(id: string) {
		if (!confirm('Ereignis löschen?')) {
			return
		}
		await api.events.remove(id)
		await refetch()
	}

	return (
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Zeitstrahl</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Ereignis
				</button>
			</div>

			<Show when={showForm()}>
				<form onSubmit={submit} class="form-card">
					<div class="form-grid">
						<label class="field">
							Titel{' '}
							<input
								value={form().title}
								onInput={(e) =>
									setForm({ ...form(), title: e.currentTarget.value })
								}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Betrag (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().amount}
								onInput={(e) =>
									setForm({ ...form(), amount: e.currentTarget.value })
								}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Richtung
							<select
								value={form().direction}
								onChange={(e) =>
									setForm({
										...form(),
										direction: e.currentTarget.value as never,
									})
								}
								class="input"
							>
								<option value="inflow">Zufluss (+)</option>
								<option value="outflow">Abfluss (−)</option>
							</select>
						</label>
						<label class="field">
							Datum{' '}
							<input
								type="date"
								value={form().date}
								onInput={(e) => setForm({ ...form(), date: e.currentTarget.value })}
								required
								class="input"
							/>
						</label>
						<label class="field field--checkbox">
							<input
								type="checkbox"
								checked={form().isRecurring}
								onChange={(e) =>
									setForm({ ...form(), isRecurring: e.currentTarget.checked })
								}
							/>{' '}
							Wiederkehrend
						</label>
						<Show when={form().isRecurring}>
							<label class="field">
								Frequenz
								<select
									value={form().frequency}
									onChange={(e) =>
										setForm({ ...form(), frequency: e.currentTarget.value })
									}
									class="input"
								>
									<option value="">— wählen</option>
									<option value="weekly">Wöchentlich</option>
									<option value="biweekly">14-tägig</option>
									<option value="monthly">Monatlich</option>
									<option value="quarterly">Quartal</option>
									<option value="yearly">Jährlich</option>
								</select>
							</label>
							<label class="field">
								Bis (Datum){' '}
								<input
									type="date"
									value={form().recurringUntil}
									onInput={(e) =>
										setForm({
											...form(),
											recurringUntil: e.currentTarget.value,
										})
									}
									class="input"
								/>
							</label>
						</Show>
						<label class="field">
							Pool (optional)
							<select
								value={form().poolId}
								onChange={(e) =>
									setForm({ ...form(), poolId: e.currentTarget.value })
								}
								class="input"
							>
								<option value="">— kein Pool</option>
								<For each={pools() ?? []}>
									{(p) => <option value={p.id}>{p.name}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Konto (optional)
							<select
								value={form().accountId}
								onChange={(e) =>
									setForm({ ...form(), accountId: e.currentTarget.value })
								}
								class="input"
							>
								<option value="">— kein Konto</option>
								<For each={accounts() ?? []}>
									{(a) => <option value={a.id}>{a.name}</option>}
								</For>
							</select>
						</label>
					</div>
					<label class="field">
						Notizen{' '}
						<input
							value={form().notes}
							onInput={(e) => setForm({ ...form(), notes: e.currentTarget.value })}
							class="input"
						/>
					</label>
					<Show when={error()}>
						<p class="form-error">{error()}</p>
					</Show>
					<div class="form-actions">
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editingId() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<div class="list list--tight">
				<For each={(events() ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))}>
					{(ev) => (
						<div class="card card--compact card-row">
							<div>
								<div class="events-title">{ev.title}</div>
								<div class="events-sub">
									{formatDateISO(ev.date)}{' '}
									<Show when={ev.isRecurring}>· {ev.frequency} ↻</Show>{' '}
									<Show when={ev.recurringUntil}>
										{' '}
										bis{' '}
										{ev.recurringUntil ? formatDateISO(ev.recurringUntil) : ''}
									</Show>
								</div>
							</div>
							<div class="card-actions">
								<span
									class="events-amount"
									classList={{
										'amount--in': ev.direction === 'inflow',
										'amount--out': ev.direction !== 'inflow',
									}}
								>
									{ev.direction === 'inflow' ? '+' : '−'}
									{formatEUR(ev.amountCents)}
								</span>
								<button
									type="button"
									onClick={() => openEdit(ev.id)}
									class="btn-icon"
									aria-label="Bearbeiten"
									title="Bearbeiten"
								>
									<IconPencil size={18} />
								</button>
								<button
									type="button"
									onClick={() => remove(ev.id)}
									class="btn-icon btn-icon--danger"
									aria-label="Löschen"
									title="Löschen"
								>
									<IconTrash size={18} />
								</button>
							</div>
						</div>
					)}
				</For>
				<Show when={(events() ?? []).length === 0 && !events.loading}>
					<p class="muted text-sm">
						Keine Ereignisse. Lege z. B. Gehalt (monatlich Zufluss) oder Miete
						(monatlich Abfluss) an.
					</p>
				</Show>
			</div>
		</div>
	)
}
