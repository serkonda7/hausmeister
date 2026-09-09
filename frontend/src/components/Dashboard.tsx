import { createResource, For, onCleanup, onMount, Show } from 'solid-js'
import { api, type LiquidityTier, type Summary } from '../lib/api'
import {
	formatDateISO,
	formatEUR,
	formatPercent,
	formatRiskLevel,
	formatShare,
	formatTargetPercent,
	liquidityColors,
	liquidityLabel,
} from '../lib/format'
import { t } from '../lib/i18n'
import './Dashboard.css'
import Amount from './Amount'
import EmptyState from './EmptyState'

function pct(cents: number, total: number): number {
	return total ? (cents / total) * 100 : 0
}

type PoolTotal = Summary['poolTotals'][number]

function isOnTarget(pt: PoolTotal, sharePct: number): boolean {
	const targetPct = pt.targetPercent
	return (
		(pt.targetMin == null || pt.currentCents >= pt.targetMin) &&
		(pt.targetMax == null || pt.currentCents <= pt.targetMax) &&
		(targetPct == null || Math.abs(sharePct - targetPct) < 5)
	)
}

export default function Dashboard() {
	const [summary, { refetch }] = createResource(() => api.summary())

	onMount(() => {
		const h = () => refetch()
		window.addEventListener('focus', h)
		onCleanup(() => window.removeEventListener('focus', h))
	})

	return (
		<div class="page page--spacious">
			<Show when={summary.loading}>
				<p class="muted">{t().common.loading}</p>
			</Show>
			<Show when={summary.error}>
				<p class="form-error">
					{t().common.error}: {(summary.error as Error).message}
				</p>
			</Show>
			<Show when={summary()}>
				{(get) => {
					const d = get()
					const total = d.totalCents
					const counts = d.counts
					const liquidityEntries = Object.entries(d.liquidityMap) as Array<
						[LiquidityTier, number]
					>
					return (
						<>
							<section class="dashboard-card">
								<div class="dashboard-eyebrow">{t().dashboard.totalAssets}</div>
								<div class="dashboard-total">{formatEUR(total)}</div>
								<div class="dashboard-sub">
									{counts.accounts} {t().dashboard.accounts} · {counts.pools}{' '}
									{t().dashboard.pools} · {counts.allocations}{' '}
									{t().dashboard.allocations}
								</div>
							</section>

							<section class="dashboard-card">
								<h2 class="dashboard-section-title">{t().dashboard.liquidity}</h2>
								<div class="list">
									<For each={liquidityEntries}>
										{([tier, cents]) => {
											const share = pct(cents, total)
											return (
												<div>
													<div class="liquidity-label-row">
														<span>{liquidityLabel(tier)}</span>
														<span class="muted">
															{formatEUR(cents)} ·{' '}
															{formatShare(share)} %
														</span>
													</div>
													<div class="bar-track">
														<div
															class="bar-fill"
															style={{
																width: `${share}%`,
																background:
																	liquidityColors[tier] ??
																	'#9ca3af',
															}}
														/>
													</div>
												</div>
											)
										}}
									</For>
								</div>
							</section>

							<section class="dashboard-card">
								<h2 class="dashboard-section-title">{t().dashboard.poolsTitle}</h2>
								<Show when={d.poolTotals.length === 0}>
									<EmptyState
										actionLabel={t().dashboard.poolsEmptyAction}
										onAction={() => {
											window.location.hash = '#/pools'
										}}
									>
										{t().dashboard.poolsEmpty}
									</EmptyState>
								</Show>
								<div class="list">
									<For each={d.poolTotals}>
										{(pt) => {
											const share = pct(pt.currentCents, total)
											const targetPct = pt.targetPercent
											const ok = isOnTarget(pt, share)
											return (
												<div class="surface-card surface-card--sm">
													<div class="pool-head">
														<div>
															<div class="pool-name">
																<span
																	class="dot dot--sm"
																	style={{
																		background:
																			pt.pool.color ??
																			'#9ca3af',
																	}}
																/>
																{pt.pool.name}
															</div>
															<Show when={pt.pool.purpose}>
																<div class="muted text-sm">
																	{pt.pool.purpose}
																</div>
															</Show>
														</div>
														<div class="pool-amounts">
															<div class="pool-amount">
																{formatEUR(pt.currentCents)}
															</div>
															<div class="pool-sub">
																{formatShare(share)} %{' '}
																{t().dashboard.ofTotal}
															</div>
														</div>
													</div>
													<div class="pool-tags">
														<span>
															{t().dashboard.target}:{' '}
															{targetPct != null
																? `${formatTargetPercent(targetPct)} (${formatEUR(pt.targetCents ?? 0)})`
																: '—'}
														</span>
														<span>
															{t().dashboard.range}:{' '}
															{pt.targetMin != null
																? formatEUR(pt.targetMin)
																: '—'}{' '}
															–{' '}
															{pt.targetMax != null
																? formatEUR(pt.targetMax)
																: '—'}
														</span>
														<span>
															{t().dashboard.return}:{' '}
															{formatPercent(
																pt.pool.expectedReturnBps,
															)}{' '}
															{t().dashboard.perAnnum}
														</span>
														<span>
															{t().dashboard.risk}:{' '}
															{formatRiskLevel(pt.pool.riskLevel)}
														</span>
														<span>
															{t().dashboard.horizon}:{' '}
															{pt.pool.horizonMonths != null
																? `${pt.pool.horizonMonths} ${t().dashboard.months}`
																: '—'}
														</span>
														<span
															class="pool-status status-badge"
															classList={{
																'status-badge--ok': ok,
																'status-badge--warn': !ok,
															}}
														>
															{ok
																? t().dashboard.onTarget
																: t().dashboard.deviation}
														</span>
													</div>
													<div class="bar-track bar-track--thin">
														<div
															class="bar-fill"
															classList={{
																'bar-fill--ok': ok,
																'bar-fill--warn': !ok,
															}}
															style={{
																// Same 0–100 % scale as the target
																// marker below so bar and marker align.
																width: `${Math.min(100, share)}%`,
															}}
														/>
														<Show when={targetPct != null}>
															<div
																class="pool-target"
																style={{
																	left: `${Math.min(100, targetPct ?? 0)}%`,
																}}
																title={`${t().dashboard.targetTooltip} ${formatTargetPercent(targetPct ?? 0)}`}
															/>
														</Show>
													</div>
												</div>
											)
										}}
									</For>
								</div>
							</section>

							<div class="dashboard-grid">
								<section class="dashboard-card">
									<h2 class="dashboard-section-title">
										{t().dashboard.cashflowTitle}
									</h2>
									<Show when={d.upcomingEvents.length === 0}>
										<EmptyState>{t().dashboard.cashflowEmpty}</EmptyState>
									</Show>
									<div class="list list--tight">
										<For each={d.upcomingEvents}>
											{(ev) => {
												const date = ev.projectedDate ?? ev.date
												return (
													<div class="row-between">
														<div>
															<div class="row-title">{ev.title}</div>
															<div class="pool-sub">
																{formatDateISO(date)}
																<Show when={ev.isRecurring}>
																	{' '}
																	· {ev.frequency} ↻
																</Show>
															</div>
														</div>
														<Amount
															cents={ev.amountCents}
															direction={ev.direction}
															class="row-amount"
														/>
													</div>
												)
											}}
										</For>
									</div>
								</section>

								<section class="dashboard-card">
									<h2 class="dashboard-section-title">
										{t().dashboard.availableFrom}
									</h2>
									<Show when={d.unlocks.length === 0}>
										<EmptyState>{t().dashboard.availableEmpty}</EmptyState>
									</Show>
									<div class="list list--tight">
										<For each={d.unlocks}>
											{(u) => (
												<div class="row-between">
													<div>
														<div class="row-title">{u.name}</div>
														<div class="pool-sub">
															{formatDateISO(u.unlockAt)}
														</div>
													</div>
													<div class="row-amount">
														{formatEUR(u.amountCents)}
													</div>
												</div>
											)}
										</For>
									</div>
								</section>
							</div>
						</>
					)
				}}
			</Show>
		</div>
	)
}
