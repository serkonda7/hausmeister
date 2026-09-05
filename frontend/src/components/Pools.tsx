import { IconPencil, IconTrash } from '@tabler/icons-solidjs'
import { createResource, createSignal, For, Show } from 'solid-js'
import { api, type Pool } from '../lib/api'
import { formatEUR, formatPercent } from '../lib/format'

export default function Pools() {
	const [pools, { refetch }] = createResource(() => api.pools.list())
	const [showForm, setShowForm] = createSignal(false)
	const [editing, setEditing] = createSignal<Pool | null>(null)
	const [error, setError] = createSignal('')
	const [form, setForm] = createSignal({
		name: '',
		purpose: '',
		targetMin: '',
		targetMax: '',
		targetPercent: '',
		expectedReturn: '',
		riskLevel: '',
		volatility: '',
		horizonMonths: '',
		color: '#22c55e',
	})

	function openCreate() {
		setEditing(null)
		setForm({
			name: '',
			purpose: '',
			targetMin: '',
			targetMax: '',
			targetPercent: '',
			expectedReturn: '',
			riskLevel: '',
			volatility: '',
			horizonMonths: '',
			color: '#22c55e',
		})
		setError('')
		setShowForm(true)
	}
	function openEdit(p: Pool) {
		setEditing(p)
		setForm({
			name: p.name,
			purpose: p.purpose ?? '',
			targetMin: p.targetMinCents != null ? (p.targetMinCents / 100).toString() : '',
			targetMax: p.targetMaxCents != null ? (p.targetMaxCents / 100).toString() : '',
			targetPercent: p.targetPercent?.toString() ?? '',
			expectedReturn:
				p.expectedReturnBps != null ? (p.expectedReturnBps / 100).toString() : '',
			riskLevel: p.riskLevel?.toString() ?? '',
			volatility: p.volatilityBps != null ? (p.volatilityBps / 100).toString() : '',
			horizonMonths: p.horizonMonths?.toString() ?? '',
			color: p.color ?? '#22c55e',
		})
		setError('')
		setShowForm(true)
	}

	async function submit(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const payload: Record<string, unknown> = {
			name: f.name,
			purpose: f.purpose || undefined,
			targetMinCents: f.targetMin
				? Math.round(Number.parseFloat(f.targetMin) * 100)
				: undefined,
			targetMaxCents: f.targetMax
				? Math.round(Number.parseFloat(f.targetMax) * 100)
				: undefined,
			targetPercent: f.targetPercent ? Number.parseInt(f.targetPercent, 10) : undefined,
			expectedReturnBps: f.expectedReturn
				? Math.round(Number.parseFloat(f.expectedReturn) * 100)
				: undefined,
			riskLevel: f.riskLevel ? Number.parseInt(f.riskLevel, 10) : undefined,
			volatilityBps: f.volatility
				? Math.round(Number.parseFloat(f.volatility) * 100)
				: undefined,
			horizonMonths: f.horizonMonths ? Number.parseInt(f.horizonMonths, 10) : undefined,
			color: f.color || undefined,
		}
		try {
			const current = editing()
			if (current) {
				await api.pools.update(current.id, payload as never)
			} else {
				await api.pools.create(payload as never)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function remove(id: string) {
		if (!confirm('Pool löschen? Zuweisungen bleiben, werden aber entkoppelt (CASCADE).')) {
			return
		}
		await api.pools.remove(id)
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
					Pools · Zweck & Zielallokation
				</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Pool
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
							Name{' '}
							<input
								value={form().name}
								onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
								required
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Zweck
							<input
								value={form().purpose}
								onInput={(e) =>
									setForm({ ...form(), purpose: e.currentTarget.value })
								}
								style={inputStyle}
								placeholder="z.B. Notgroschen, Altersvorsorge"
							/>
						</label>
						<label style={labelStyle}>
							Ziel Min (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().targetMin}
								onInput={(e) =>
									setForm({ ...form(), targetMin: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Ziel Max (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().targetMax}
								onInput={(e) =>
									setForm({ ...form(), targetMax: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Ziel % (0-100){' '}
							<input
								type="number"
								min="0"
								max="100"
								value={form().targetPercent}
								onInput={(e) =>
									setForm({ ...form(), targetPercent: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Erwartete Rendite % p.a.{' '}
							<input
								type="number"
								step="0.01"
								value={form().expectedReturn}
								onInput={(e) =>
									setForm({ ...form(), expectedReturn: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Risiko 1-5{' '}
							<input
								type="number"
								min="1"
								max="5"
								value={form().riskLevel}
								onInput={(e) =>
									setForm({ ...form(), riskLevel: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Volatilität %{' '}
							<input
								type="number"
								step="0.01"
								value={form().volatility}
								onInput={(e) =>
									setForm({ ...form(), volatility: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Horizont (Monate){' '}
							<input
								type="number"
								value={form().horizonMonths}
								onInput={(e) =>
									setForm({ ...form(), horizonMonths: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Farbe{' '}
							<input
								type="color"
								value={form().color}
								onInput={(e) =>
									setForm({ ...form(), color: e.currentTarget.value })
								}
								style={{ ...inputStyle, padding: '0.15rem' }}
							/>
						</label>
					</div>
					<Show when={error()}>
						<p style={{ color: 'var(--error)', 'font-size': '0.875rem' }}>{error()}</p>
					</Show>
					<div style={{ display: 'flex', gap: '0.5rem', 'justify-content': 'flex-end' }}>
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editing() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<div style={{ display: 'grid', gap: '0.75rem' }}>
				<For each={pools() ?? []}>
					{(p) => (
						<div
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								'border-radius': '12px',
								padding: '1rem',
							}}
						>
							<div
								style={{
									display: 'flex',
									'justify-content': 'space-between',
									'align-items': 'center',
								}}
							>
								<div
									style={{
										display: 'flex',
										gap: '0.6rem',
										'align-items': 'center',
									}}
								>
									<span
										style={{
											width: '12px',
											height: '12px',
											'border-radius': '999px',
											background: p.color ?? '#9ca3af',
											display: 'inline-block',
										}}
									/>
									<span style={{ 'font-weight': '600' }}>{p.name}</span>
									<Show when={p.purpose}>
										<span
											style={{
												color: 'var(--muted)',
												'font-size': '0.85rem',
											}}
										>
											· {p.purpose}
										</span>
									</Show>
								</div>
								<div style={{ display: 'flex', gap: '0.5rem' }}>
									<button
										type="button"
										onClick={() => openEdit(p)}
										class="btn-icon"
										aria-label="Bearbeiten"
										title="Bearbeiten"
									>
										<IconPencil size={18} />
									</button>
									<button
										type="button"
										onClick={() => remove(p.id)}
										class="btn-icon btn-icon--danger"
										aria-label="Löschen"
										title="Löschen"
									>
										<IconTrash size={18} />
									</button>
								</div>
							</div>
							<div
								style={{
									color: 'var(--muted)',
									'font-size': '0.8rem',
									'margin-top': '0.5rem',
									display: 'flex',
									gap: '1rem',
									'flex-wrap': 'wrap',
								}}
							>
								<span>
									Ziel: {p.targetPercent != null ? `${p.targetPercent}%` : '—'}{' '}
									{p.targetMinCents != null || p.targetMaxCents != null
										? `(${p.targetMinCents != null ? formatEUR(p.targetMinCents) : '—'} – ${p.targetMaxCents != null ? formatEUR(p.targetMaxCents) : '—'})`
										: ''}
								</span>
								<span>Rendite: {formatPercent(p.expectedReturnBps)}</span>
								<span>Risiko: {p.riskLevel ?? '—'}/5</span>
								<span>Vol: {formatPercent(p.volatilityBps)}</span>
								<span>Horizont: {p.horizonMonths ?? '—'} M</span>
							</div>
						</div>
					)}
				</For>
				<Show when={(pools() ?? []).length === 0 && !pools.loading}>
					<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
						Keine Pools. Erstelle z. B. „Notgroschen“, „Invest“, „Urlaub“.
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
