import { createResource, createSignal, For, Show } from 'solid-js'
import { type Account, api } from '../lib/api'
import { accountTypeLabels, formatEUR, liquidityLabels } from '../lib/format'

export default function Accounts() {
	const [accounts, { refetch }] = createResource(() => api.accounts.list())
	const [showForm, setShowForm] = createSignal(false)
	const [editing, setEditing] = createSignal<Account | null>(null)
	const [form, setForm] = createSignal({
		name: '',
		type: 'checking' as Account['type'],
		institution: '',
		liquidityTier: 'instant' as Account['liquidityTier'],
		balance: '',
		unlockAt: '',
		notes: '',
	})
	const [error, setError] = createSignal('')

	function openCreate() {
		setEditing(null)
		setForm({
			name: '',
			type: 'checking',
			institution: '',
			liquidityTier: 'instant',
			balance: '',
			unlockAt: '',
			notes: '',
		})
		setError('')
		setShowForm(true)
	}
	function openEdit(a: Account) {
		setEditing(a)
		setForm({
			name: a.name,
			type: a.type,
			institution: a.institution ?? '',
			liquidityTier: a.liquidityTier,
			balance: (a.balanceCents / 100).toString(),
			unlockAt: a.unlockAt ?? '',
			notes: a.notes ?? '',
		})
		setError('')
		setShowForm(true)
	}

	async function submit(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const balanceCents = Math.round(Number.parseFloat(f.balance || '0') * 100)
		if (Number.isNaN(balanceCents)) {
			setError('Ungültiger Betrag')
			return
		}
		const payload = {
			name: f.name,
			type: f.type,
			institution: f.institution || undefined,
			liquidityTier: f.liquidityTier,
			balanceCents,
			unlockAt: f.unlockAt || undefined,
			notes: f.notes || undefined,
		}
		try {
			const current = editing()
			if (current) {
				await api.accounts.update(current.id, payload)
			} else {
				await api.accounts.create(payload as never)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function remove(id: string) {
		if (!confirm('Wirklich löschen?')) {
			return
		}
		await api.accounts.remove(id)
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
					Konten · Wo liegt das Geld
				</h2>
				<button
					type="button"
					onClick={openCreate}
					style={{
						background: '#111827',
						color: 'white',
						border: 'none',
						'border-radius': '8px',
						padding: '0.5rem 0.9rem',
						cursor: 'pointer',
						'font-weight': '600',
					}}
				>
					+ Konto
				</button>
			</div>

			<Show when={showForm()}>
				<form
					onSubmit={submit}
					style={{
						background: 'white',
						border: '1px solid #e5e7eb',
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
						<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
							Name{' '}
							<input
								value={form().name}
								onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
								required
								style={inputStyle}
							/>
						</label>
						<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
							Typ
							<select
								value={form().type}
								onChange={(e) =>
									setForm({ ...form(), type: e.currentTarget.value as never })
								}
								style={inputStyle}
							>
								<For each={Object.entries(accountTypeLabels)}>
									{([k, v]) => <option value={k}>{v}</option>}
								</For>
							</select>
						</label>
						<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
							Institut{' '}
							<input
								value={form().institution}
								onInput={(e) =>
									setForm({ ...form(), institution: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
							Verfügbarkeit
							<select
								value={form().liquidityTier}
								onChange={(e) =>
									setForm({
										...form(),
										liquidityTier: e.currentTarget.value as never,
									})
								}
								style={inputStyle}
							>
								<For each={Object.entries(liquidityLabels)}>
									{([k, v]) => <option value={k}>{v}</option>}
								</For>
							</select>
						</label>
						<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
							Saldo (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().balance}
								onInput={(e) =>
									setForm({ ...form(), balance: e.currentTarget.value })
								}
								required
								style={inputStyle}
							/>
						</label>
						<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
							Verfügbar ab (ISO Datum){' '}
							<input
								type="date"
								value={form().unlockAt}
								onInput={(e) =>
									setForm({ ...form(), unlockAt: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
					</div>
					<label style={{ display: 'grid', gap: '0.25rem', 'font-size': '0.875rem' }}>
						Notizen{' '}
						<input
							value={form().notes}
							onInput={(e) => setForm({ ...form(), notes: e.currentTarget.value })}
							style={inputStyle}
						/>
					</label>
					<Show when={error()}>
						<p style={{ color: '#ef4444', 'font-size': '0.875rem' }}>{error()}</p>
					</Show>
					<div style={{ display: 'flex', gap: '0.5rem', 'justify-content': 'flex-end' }}>
						<button type="button" onClick={() => setShowForm(false)} style={ghostBtn}>
							Abbrechen
						</button>
						<button type="submit" style={primaryBtn}>
							{editing() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<Show when={accounts.loading}>
				<p style={{ color: '#6b7280' }}>Laden…</p>
			</Show>

			<div style={{ display: 'grid', gap: '0.75rem' }}>
				<For each={accounts() ?? []}>
					{(a) => (
						<div
							style={{
								background: 'white',
								border: '1px solid #e5e7eb',
								'border-radius': '12px',
								padding: '1rem',
								display: 'flex',
								'justify-content': 'space-between',
								'align-items': 'center',
								gap: '1rem',
							}}
						>
							<div>
								<div style={{ 'font-weight': '600' }}>
									{a.name}{' '}
									<span style={{ color: '#6b7280', 'font-weight': '400' }}>
										· {accountTypeLabels[a.type]}
									</span>
								</div>
								<div style={{ color: '#6b7280', 'font-size': '0.8rem' }}>
									{a.institution ?? '—'} · {liquidityLabels[a.liquidityTier]}
									<Show when={a.unlockAt}> · ab {a.unlockAt}</Show>
								</div>
							</div>
							<div
								style={{ display: 'flex', gap: '0.5rem', 'align-items': 'center' }}
							>
								<div style={{ 'font-weight': '700', 'white-space': 'nowrap' }}>
									{formatEUR(a.balanceCents)}
								</div>
								<button type="button" onClick={() => openEdit(a)} style={ghostBtn}>
									Edit
								</button>
								<button
									type="button"
									onClick={() => remove(a.id)}
									style={{ ...ghostBtn, color: '#dc2626' }}
								>
									Löschen
								</button>
							</div>
						</div>
					)}
				</For>
				<Show when={(accounts() ?? []).length === 0 && !accounts.loading}>
					<p style={{ color: '#6b7280', 'font-size': '0.875rem' }}>
						Keine Konten. Lege dein erstes Konto an.
					</p>
				</Show>
			</div>
		</div>
	)
}

const inputStyle: Record<string, string> = {
	border: '1px solid #d1d5db',
	'border-radius': '8px',
	padding: '0.5rem 0.6rem',
	'font-size': '0.875rem',
}
const primaryBtn: Record<string, string> = {
	background: '#111827',
	color: 'white',
	border: 'none',
	'border-radius': '8px',
	padding: '0.5rem 0.9rem',
	cursor: 'pointer',
	'font-weight': '600',
}
const ghostBtn: Record<string, string> = {
	background: 'white',
	color: '#111827',
	border: '1px solid #e5e7eb',
	'border-radius': '8px',
	padding: '0.45rem 0.7rem',
	cursor: 'pointer',
	'font-weight': '500',
}
