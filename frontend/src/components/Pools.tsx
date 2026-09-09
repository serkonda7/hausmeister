import { createResource, createSignal, For, Show } from 'solid-js'
import { api, type Pool } from '../lib/api'
import { patchForm } from '../lib/form'
import { formatEUR, formatPercent, formatRiskLevel, riskLevelLabels } from '../lib/format'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import CrudRow from './CrudRow'
import EmptyState from './EmptyState'

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
			targetMin: centsToEuroInput(p.targetMinCents),
			targetMax: centsToEuroInput(p.targetMaxCents),
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
		const targetMinCents = parseEuroToCents(f.targetMin)
		const targetMaxCents = parseEuroToCents(f.targetMax)
		const targetPercent =
			f.targetPercent.trim() === '' ? null : Number.parseInt(f.targetPercent, 10)
		const expectedReturnBps =
			f.expectedReturn.trim() === ''
				? null
				: Math.round(Number.parseFloat(f.expectedReturn) * 100)
		const riskLevel = f.riskLevel.trim() === '' ? null : Number.parseInt(f.riskLevel, 10)
		const volatilityBps =
			f.volatility.trim() === '' ? null : Math.round(Number.parseFloat(f.volatility) * 100)
		const horizonMonths =
			f.horizonMonths.trim() === '' ? null : Number.parseInt(f.horizonMonths, 10)
		if (
			[
				targetMinCents,
				targetMaxCents,
				targetPercent,
				expectedReturnBps,
				riskLevel,
				volatilityBps,
				horizonMonths,
			].some((v) => v !== null && Number.isNaN(v))
		) {
			setError('Invalid number input')
			return
		}
		const payload: Omit<Pool, 'id' | 'createdAt'> = {
			name: f.name,
			purpose: f.purpose || null,
			targetMinCents,
			targetMaxCents,
			targetPercent,
			expectedReturnBps,
			riskLevel,
			volatilityBps,
			horizonMonths,
			color: f.color || null,
		}
		try {
			const current = editing()
			if (current) {
				await api.pools.update(current.id, payload)
			} else {
				await api.pools.create(payload)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function remove(id: string) {
		if (!confirm('Delete pool? Allocations will be kept.')) {
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
								onInput={(e) => patchForm(setForm, 'name', e.currentTarget.value)}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Purpose
							<input
								value={form().purpose}
								onInput={(e) =>
									patchForm(setForm, 'purpose', e.currentTarget.value)
								}
								class="input"
								placeholder="e.g. Emergency fund, Retirement"
							/>
						</label>
						<label class="field">
							Target min (€){' '}
							<input
								type="number"
								step="1"
								value={form().targetMin}
								onInput={(e) =>
									patchForm(setForm, 'targetMin', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Target max (€){' '}
							<input
								type="number"
								step="1"
								value={form().targetMax}
								onInput={(e) =>
									patchForm(setForm, 'targetMax', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Target %{' '}
							<input
								type="number"
								min="0"
								max="100"
								step="1"
								value={form().targetPercent}
								onInput={(e) =>
									patchForm(setForm, 'targetPercent', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Expected return % p.a.{' '}
							<input
								type="number"
								step="0.1"
								value={form().expectedReturn}
								onInput={(e) =>
									patchForm(setForm, 'expectedReturn', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Risk{' '}
							<select
								value={form().riskLevel}
								onChange={(e) =>
									patchForm(setForm, 'riskLevel', e.currentTarget.value)
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
							Volatility %{' '}
							<input
								type="number"
								step="0.1"
								value={form().volatility}
								onInput={(e) =>
									patchForm(setForm, 'volatility', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Horizon (months){' '}
							<input
								type="number"
								value={form().horizonMonths}
								onInput={(e) =>
									patchForm(setForm, 'horizonMonths', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Color{' '}
							<input
								type="color"
								value={form().color}
								onInput={(e) => patchForm(setForm, 'color', e.currentTarget.value)}
								class="input"
							/>
						</label>
					</div>
					<Show when={error()}>
						<p class="form-error">{error()}</p>
					</Show>
					<div class="form-actions">
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Cancel
						</button>
						<button type="submit" class="btn-primary">
							{editing() ? 'Save' : 'Create'}
						</button>
					</div>
				</form>
			</Show>

			<div class="list">
				<For each={pools() ?? []}>
					{(p) => (
						<div class="card">
							<div class="card-row">
								<div class="inline-row">
									<span
										class="dot"
										style={{ background: p.color ?? '#9ca3af' }}
									/>
									<span class="strong">{p.name}</span>
									<Show when={p.purpose}>
										<span class="muted text-sm">· {p.purpose}</span>
									</Show>
								</div>
								<div class="card-actions">
									<CrudRow
										onEdit={() => openEdit(p)}
										onDelete={() => remove(p.id)}
									/>
								</div>
							</div>
							<div class="muted text-sm meta-row">
								<span>
									Target: {p.targetPercent != null ? `${p.targetPercent}%` : '—'}{' '}
									{p.targetMinCents != null || p.targetMaxCents != null
										? `(${p.targetMinCents != null ? formatEUR(p.targetMinCents) : '—'} – ${p.targetMaxCents != null ? formatEUR(p.targetMaxCents) : '—'})`
										: ''}
								</span>
								<span>Return: {formatPercent(p.expectedReturnBps)}</span>
								<span>Risk: {formatRiskLevel(p.riskLevel)}</span>
								<span>Volatility: {formatPercent(p.volatilityBps)}</span>
								<span>
									Horizon:{' '}
									{p.horizonMonths != null ? `${p.horizonMonths} months` : '—'}
								</span>
							</div>
						</div>
					)}
				</For>
				<Show when={(pools() ?? []).length === 0 && !pools.loading}>
					<EmptyState>
						No pools. Create e.g. “Emergency fund”, “Invest”, “Vacation”.
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
