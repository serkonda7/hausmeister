import { IconPencil, IconTrash } from '@tabler/icons-solidjs'
import { createResource, createSignal, For, Show } from 'solid-js'
import { api, type Pool } from '../lib/api'
import { formatEUR, formatPercent, formatRiskLevel, riskLevelLabels } from '../lib/format'
import './Pools.css'

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
		if (!confirm('Pool löschen? Zuweisungen bleiben erhalten.')) {
			return
		}
		await api.pools.remove(id)
		await refetch()
	}

	return (
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Pools</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Pool
				</button>
			</div>

			<Show when={showForm()}>
				<form onSubmit={submit} class="form-card">
					<div class="form-grid">
						<label class="field">
							Name{' '}
							<input
								value={form().name}
								onInput={(e) => setForm({ ...form(), name: e.currentTarget.value })}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Zweck
							<input
								value={form().purpose}
								onInput={(e) =>
									setForm({ ...form(), purpose: e.currentTarget.value })
								}
								class="input"
								placeholder="z.B. Notgroschen, Altersvorsorge"
							/>
						</label>
						<label class="field">
							Ziel Min (€){' '}
							<input
								type="number"
								step="1"
								value={form().targetMin}
								onInput={(e) =>
									setForm({ ...form(), targetMin: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
						<label class="field">
							Ziel Max (€){' '}
							<input
								type="number"
								step="1"
								value={form().targetMax}
								onInput={(e) =>
									setForm({ ...form(), targetMax: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
						<label class="field">
							Ziel %{' '}
							<input
								type="number"
								min="0"
								max="100"
								step="1"
								value={form().targetPercent}
								onInput={(e) =>
									setForm({ ...form(), targetPercent: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
						<label class="field">
							Erwartete Rendite % p.a.{' '}
							<input
								type="number"
								step="0.1"
								value={form().expectedReturn}
								onInput={(e) =>
									setForm({ ...form(), expectedReturn: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
						<label class="field">
							Risiko{' '}
							<select
								value={form().riskLevel}
								onChange={(e) =>
									setForm({ ...form(), riskLevel: e.currentTarget.value })
								}
								class="input"
							>
								<option value="">—</option>
								<For each={[1, 2, 3, 4, 5]}>
									{(level) => (
										<option value={level.toString()}>
											{level} – {riskLevelLabels[level]}
										</option>
									)}
								</For>
							</select>
						</label>
						<label class="field">
							Volatilität %{' '}
							<input
								type="number"
								step="0.1"
								value={form().volatility}
								onInput={(e) =>
									setForm({ ...form(), volatility: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
						<label class="field">
							Horizont (Monate){' '}
							<input
								type="number"
								value={form().horizonMonths}
								onInput={(e) =>
									setForm({ ...form(), horizonMonths: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
						<label class="field">
							Farbe{' '}
							<input
								type="color"
								value={form().color}
								onInput={(e) =>
									setForm({ ...form(), color: e.currentTarget.value })
								}
								class="input"
							/>
						</label>
					</div>
					<Show when={error()}>
						<p class="form-error">{error()}</p>
					</Show>
					<div class="form-actions">
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editing() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<div class="list">
				<For each={pools() ?? []}>
					{(p) => (
						<div class="card">
							<div class="card-row">
								<div class="pools-head">
									<span
										class="dot"
										style={{ background: p.color ?? '#9ca3af' }}
									/>
									<span class="strong">{p.name}</span>
									<Show when={p.purpose}>
										<span class="pools-purpose">· {p.purpose}</span>
									</Show>
								</div>
								<div class="card-actions">
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
							<div class="pools-meta">
								<span>
									Ziel: {p.targetPercent != null ? `${p.targetPercent}%` : '—'}{' '}
									{p.targetMinCents != null || p.targetMaxCents != null
										? `(${p.targetMinCents != null ? formatEUR(p.targetMinCents) : '—'} – ${p.targetMaxCents != null ? formatEUR(p.targetMaxCents) : '—'})`
										: ''}
								</span>
								<span>Rendite: {formatPercent(p.expectedReturnBps)}</span>
								<span>Risiko: {formatRiskLevel(p.riskLevel)}</span>
								<span>Volatilität: {formatPercent(p.volatilityBps)}</span>
								<span>
									Horizont:{' '}
									{p.horizonMonths != null ? `${p.horizonMonths} Monate` : '—'}
								</span>
							</div>
						</div>
					)}
				</For>
				<Show when={(pools() ?? []).length === 0 && !pools.loading}>
					<p class="muted text-sm">
						Keine Pools. Erstelle z. B. „Notgroschen“, „Invest“, „Urlaub“.
					</p>
				</Show>
			</div>
		</div>
	)
}
