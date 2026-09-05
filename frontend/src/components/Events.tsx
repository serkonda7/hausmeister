import { IconPencil, IconTrash } from '@tabler/icons-solidjs'
import { createResource, createSignal, For, Show } from 'solid-js'
import { api } from '../lib/api'
import { formatDateISO, formatEUR } from '../lib/format'

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
		<div style={{ display: 'grid', gap: '1rem' }}>
			<div
				style={{
					display: 'flex',
					'justify-content': 'space-between',
					'align-items': 'center',
				}}
			>
				<h2 style={{ margin: 0, 'font-size': '1.125rem', 'font-weight': '600' }}>
					Zeitstrahl
				</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Ereignis
				</button>
			</div>

			<Show when={showForm()}>
				<form
					onSubmit={submit}
					style={{
						background: 'var(--surface)',
						border: '1px solid var(--border)',
						'border-radius': '12px',
						padding: '1rem',
						display: 'grid',
						gap: '0.75rem',
					}}
				>
					<div
						style={{
							display: 'grid',
							'grid-template-columns': '1fr 1fr',
							gap: '0.75rem',
						}}
					>
						<label style={labelStyle}>
							Titel{' '}
							<input
								value={form().title}
								onInput={(e) =>
									setForm({ ...form(), title: e.currentTarget.value })
								}
								required
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Betrag (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().amount}
								onInput={(e) =>
									setForm({ ...form(), amount: e.currentTarget.value })
								}
								required
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Richtung
							<select
								value={form().direction}
								onChange={(e) =>
									setForm({
										...form(),
										direction: e.currentTarget.value as never,
									})
								}
								style={inputStyle}
							>
								<option value="inflow">Zufluss (+)</option>
								<option value="outflow">Abfluss (−)</option>
							</select>
						</label>
						<label style={labelStyle}>
							Datum{' '}
							<input
								type="date"
								value={form().date}
								onInput={(e) => setForm({ ...form(), date: e.currentTarget.value })}
								required
								style={inputStyle}
							/>
						</label>
						<label
							style={{
								...labelStyle,
								display: 'flex',
								'align-items': 'center',
								gap: '0.5rem',
								'padding-top': '1.2rem',
							}}
						>
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
							<label style={labelStyle}>
								Frequenz
								<select
									value={form().frequency}
									onChange={(e) =>
										setForm({ ...form(), frequency: e.currentTarget.value })
									}
									style={inputStyle}
								>
									<option value="">— wählen</option>
									<option value="weekly">Wöchentlich</option>
									<option value="biweekly">14-tägig</option>
									<option value="monthly">Monatlich</option>
									<option value="quarterly">Quartal</option>
									<option value="yearly">Jährlich</option>
								</select>
							</label>
							<label style={labelStyle}>
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
									style={inputStyle}
								/>
							</label>
						</Show>
						<label style={labelStyle}>
							Pool (optional)
							<select
								value={form().poolId}
								onChange={(e) =>
									setForm({ ...form(), poolId: e.currentTarget.value })
								}
								style={inputStyle}
							>
								<option value="">— kein Pool</option>
								<For each={pools() ?? []}>
									{(p) => <option value={p.id}>{p.name}</option>}
								</For>
							</select>
						</label>
						<label style={labelStyle}>
							Konto (optional)
							<select
								value={form().accountId}
								onChange={(e) =>
									setForm({ ...form(), accountId: e.currentTarget.value })
								}
								style={inputStyle}
							>
								<option value="">— kein Konto</option>
								<For each={accounts() ?? []}>
									{(a) => <option value={a.id}>{a.name}</option>}
								</For>
							</select>
						</label>
					</div>
					<label style={labelStyle}>
						Notizen{' '}
						<input
							value={form().notes}
							onInput={(e) => setForm({ ...form(), notes: e.currentTarget.value })}
							style={inputStyle}
						/>
					</label>
					<Show when={error()}>
						<p style={{ color: 'var(--error)', 'font-size': '0.875rem' }}>{error()}</p>
					</Show>
					<div style={{ display: 'flex', gap: '0.5rem', 'justify-content': 'flex-end' }}>
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editingId() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<div style={{ display: 'grid', gap: '0.6rem' }}>
				<For each={(events() ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))}>
					{(ev) => (
						<div
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								'border-radius': '12px',
								padding: '0.9rem',
								display: 'flex',
								'justify-content': 'space-between',
								'align-items': 'center',
								gap: '1rem',
							}}
						>
							<div>
								<div style={{ 'font-weight': '600', 'font-size': '0.9rem' }}>
									{ev.title}
								</div>
								<div style={{ color: 'var(--muted)', 'font-size': '0.75rem' }}>
									{formatDateISO(ev.date)}{' '}
									<Show when={ev.isRecurring}>· {ev.frequency} ↻</Show>{' '}
									<Show when={ev.recurringUntil}>
										{' '}
										bis{' '}
										{ev.recurringUntil ? formatDateISO(ev.recurringUntil) : ''}
									</Show>
								</div>
							</div>
							<div
								style={{ display: 'flex', gap: '0.5rem', 'align-items': 'center' }}
							>
								<span
									style={{
										'font-weight': '700',
										color:
											ev.direction === 'inflow'
												? 'var(--success)'
												: 'var(--danger)',
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
					<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
						Keine Ereignisse. Lege z. B. Gehalt (monatlich Zufluss) oder Miete
						(monatlich Abfluss) an.
					</p>
				</Show>
			</div>
		</div>
	)
}

const labelStyle: Record<string, string> = {
	display: 'grid',
	gap: '0.25rem',
	'font-size': '0.875rem',
}
const inputStyle: Record<string, string> = {
	border: '1px solid var(--border-strong)',
	'border-radius': '8px',
	padding: '0.5rem 0.6rem',
	'font-size': '0.875rem',
	background: 'var(--input-bg)',
	color: 'var(--text)',
}
