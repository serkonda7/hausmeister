import { createMemo, createResource, For, Show } from 'solid-js'
import { api, type Pool } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatEUR, formatPercent, formatRiskLevel, riskLevelLabel } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import EmptyState from './EmptyState'

export default function Pools() {
	const [pools, { refetch }] = createResource(() => api.pools.list())
	const crud = useCrudForm<
		{
			name: string
			purpose: string
			targetMin: string
			targetMax: string
			targetPercent: string
			expectedReturn: string
			riskLevel: string
			volatility: string
			horizonMonths: string
			color: string
		},
		Pool
	>({
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
	const form = crud.form
	const setForm = crud.setForm

	function openCreate() {
		crud.openCreate({
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
	}
	function openEdit(p: Pool) {
		crud.openEdit(p, {
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
	}

	function submit(e: Event) {
		return crud.submit(e, async () => {
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
				f.volatility.trim() === ''
					? null
					: Math.round(Number.parseFloat(f.volatility) * 100)
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
				throw new Error(t().pools.invalidNumber)
			}
			if (
				targetMinCents != null &&
				targetMaxCents != null &&
				targetMinCents > targetMaxCents
			) {
				throw new Error(t().pools.minExceedsMax)
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
			const current = crud.editing()
			if (current) {
				await api.pools.update(current.id, payload)
			} else {
				await api.pools.create(payload)
			}
			await refetch()
		})
	}

	function remove(id: string) {
		return removeWithConfirm(t().pools.confirmDelete, () => api.pools.remove(id), refetch)
	}

	// Medium audit: live client-side validation hints (min > max, % sum > 100).
	const minCents = () => parseEuroToCents(form().targetMin)
	const maxCents = () => parseEuroToCents(form().targetMax)
	const minMaxInvalid = createMemo(() => {
		const lo = minCents()
		const hi = maxCents()
		return lo != null && hi != null && !Number.isNaN(lo) && !Number.isNaN(hi) && lo > hi
	})
	const targetPercentNum = () => {
		const tt = form().targetPercent.trim()
		return tt === '' ? null : Number.parseInt(tt, 10)
	}
	const percentOutOfRange = createMemo(() => {
		const v = targetPercentNum()
		return v != null && !Number.isNaN(v) && (v < 0 || v > 100)
	})
	const percentSumOver = createMemo(() => {
		const cur = targetPercentNum()
		if (cur == null || Number.isNaN(cur)) {
			return null
		}
		const editingId = crud.editing()?.id
		const sum = (pools() ?? [])
			.filter((p) => p.id !== editingId)
			.reduce((s, p) => s + (p.targetPercent ?? 0), 0)
		const total = sum + cur
		return total > 100 ? total : null
	})

	return (
		<div class="page">
			<div class="page-header">
				<div>
					<h2 class="page-title">{t().nav.pools}</h2>
					<p class="page-subtitle">
						{(pools() ?? []).length} {t().pools.subtitleSuffix}
					</p>
				</div>
				<button type="button" onClick={openCreate} class="btn-primary">
					{t().pools.add}
				</button>
			</div>

			<CrudForm
				open={crud.showForm()}
				error={crud.error()}
				editing={crud.editing()}
				onSubmit={submit}
				onCancel={crud.close}
			>
				<fieldset class="form-group">
					<legend>{t().pools.basics}</legend>
					<div class="form-grid">
						<label class="field">
							{t().pools.name}{' '}
							<span class="req" aria-hidden="true">
								*
							</span>
							<input
								value={form().name}
								onInput={(e) => patchForm(setForm, 'name', e.currentTarget.value)}
								required
								aria-required="true"
								class="input"
							/>
						</label>
						<label class="field">
							{t().pools.purpose}
							<input
								value={form().purpose}
								onInput={(e) =>
									patchForm(setForm, 'purpose', e.currentTarget.value)
								}
								class="input"
								placeholder={t().pools.purposePlaceholder}
							/>
						</label>
						<label class="field">
							{t().pools.color}
							<input
								type="color"
								value={form().color}
								onInput={(e) => patchForm(setForm, 'color', e.currentTarget.value)}
								class="color-swatch"
								aria-label={t().pools.colorAria}
							/>
						</label>
					</div>
				</fieldset>
				<fieldset class="form-group">
					<legend>{t().pools.targets}</legend>
					<div class="form-grid">
						<label class="field">
							{t().pools.targetMin}{' '}
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
							{t().pools.targetMax}{' '}
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
							{t().pools.targetPct}{' '}
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
								aria-describedby="pool-target-hints"
							/>
						</label>
					</div>
					<div id="pool-target-hints">
						<Show when={minMaxInvalid()}>
							<p class="form-hint form-hint--error">{t().pools.minMaxHint}</p>
						</Show>
						<Show when={percentOutOfRange()}>
							<p class="form-hint form-hint--error">{t().pools.pctRangeHint}</p>
						</Show>
						<Show when={percentSumOver() != null}>
							<p class="form-hint form-hint--error">
								{t().pools.pctSumPrefix}
								{percentSumOver()}
								{t().pools.pctSumSuffix}
							</p>
						</Show>
					</div>
				</fieldset>
				<fieldset class="form-group">
					<legend>{t().pools.riskReturn}</legend>
					<div class="form-grid">
						<label class="field">
							{t().pools.expectedReturn}{' '}
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
							{t().pools.risk}{' '}
							<select
								value={form().riskLevel}
								onChange={(e) =>
									patchForm(setForm, 'riskLevel', e.currentTarget.value)
								}
								class="input"
							>
								<option value="">{t().common.dash}</option>
								<For each={[1, 2, 3, 4, 5]}>
									{(level) => (
										<option value={level.toString()}>
											{level} – {riskLevelLabel(level)}
										</option>
									)}
								</For>
							</select>
						</label>
						<label class="field">
							{t().pools.volatility}{' '}
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
							{t().pools.horizon}{' '}
							<input
								type="number"
								value={form().horizonMonths}
								onInput={(e) =>
									patchForm(setForm, 'horizonMonths', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
					</div>
				</fieldset>
			</CrudForm>

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
									{t().pools.targetMeta}:{' '}
									{p.targetPercent != null ? `${p.targetPercent}%` : '—'}{' '}
									{p.targetMinCents != null || p.targetMaxCents != null
										? `(${p.targetMinCents != null ? formatEUR(p.targetMinCents) : '—'} – ${p.targetMaxCents != null ? formatEUR(p.targetMaxCents) : '—'})`
										: ''}
								</span>
								<span>
									{t().pools.returnMeta}: {formatPercent(p.expectedReturnBps)}
								</span>
								<span>
									{t().pools.riskMeta}: {formatRiskLevel(p.riskLevel)}
								</span>
								<span>
									{t().pools.volatilityMeta}: {formatPercent(p.volatilityBps)}
								</span>
								<span>
									{t().pools.horizonMeta}:{' '}
									{p.horizonMonths != null
										? `${p.horizonMonths} ${t().pools.monthsSuffix}`
										: '—'}
								</span>
							</div>
						</div>
					)}
				</For>
				<Show when={(pools() ?? []).length === 0 && !pools.loading}>
					<EmptyState actionLabel={t().pools.emptyAction} onAction={openCreate}>
						{t().pools.emptyText}
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
