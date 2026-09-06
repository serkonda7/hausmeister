import { createEffect, createResource, For, Show } from 'solid-js'
import { api } from '../lib/api'
import {
	formatDateISO,
	formatEUR,
	formatPercent,
	formatRiskLevel,
	liquidityColors,
	liquidityLabels,
} from '../lib/format'
import './Dashboard.css'

export default function Dashboard() {
	const [summary, { refetch }] = createResource(() => api.summary())

	createEffect(() => {
		const h = () => refetch()
		window.addEventListener('focus', h)
		return () => window.removeEventListener('focus', h)
	})

	return (
		<div class="page page--spacious">
			<Show when={summary.loading}>
				<p class="muted">Laden…</p>
			</Show>
			<Show when={summary.error}>
				<p class="form-error">Fehler: {(summary.error as Error).message}</p>
			</Show>
			<Show when={summary()}>
				{(data) => (
					<>
						<section class="dashboard-card">
							<div class="dashboard-eyebrow">Gesamtvermögen</div>
							<div class="dashboard-total">{formatEUR(data().totalCents)}</div>
							<div class="dashboard-sub">
								{data().counts.accounts} Konten · {data().counts.pools} Pools ·{' '}
								{data().counts.allocations} Zuweisungen
							</div>
						</section>

						<section class="dashboard-card">
							<h2 class="dashboard-section-title">Verfügbarkeit</h2>
							<div class="list">
								<For
									each={
										Object.entries(data().liquidityMap) as Array<
											[string, number]
										>
									}
								>
									{([tier, cents]) => {
										const pct = data().totalCents
											? (cents / data().totalCents) * 100
											: 0
										return (
											<div>
												<div class="liquidity-label-row">
													<span>{liquidityLabels[tier] ?? tier}</span>
													<span class="muted">
														{formatEUR(cents)} · {pct.toFixed(1)}%
													</span>
												</div>
												<div class="liquidity-track">
													<div
														class="liquidity-fill"
														style={{
															width: `${pct}%`,
															background:
																liquidityColors[tier] ?? '#9ca3af',
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
							<h2 class="dashboard-section-title">Pools · Ziel vs. Ist</h2>
							<Show when={data().poolTotals.length === 0}>
								<p class="muted text-sm">
									Noch keine Pools angelegt. Lege einen Pool in „Pools“ an.
								</p>
							</Show>
							<div class="list">
								<For each={data().poolTotals}>
									{(pt) => {
										const pct = data().totalCents
											? (pt.currentCents / data().totalCents) * 100
											: 0
										const targetPct = pt.targetPercent
										const ok =
											(pt.targetMin == null ||
												pt.currentCents >= pt.targetMin) &&
											(pt.targetMax == null ||
												pt.currentCents <= pt.targetMax) &&
											(targetPct == null || Math.abs(pct - targetPct) < 5)
										return (
											<div class="pool-card">
												<div class="pool-head">
													<div>
														<div class="pool-name">
															<span
																class="dot dot--sm"
																style={{
																	background:
																		pt.pool.color ?? '#9ca3af',
																}}
															/>
															{pt.pool.name}
														</div>
														<Show when={pt.pool.purpose}>
															<div class="pool-purpose">
																{pt.pool.purpose}
															</div>
														</Show>
													</div>
													<div class="pool-amounts">
														<div class="pool-amount">
															{formatEUR(pt.currentCents)}
														</div>
														<div class="pool-sub">
															{pct.toFixed(1)}% des Gesamt
														</div>
													</div>
												</div>
												<div class="pool-tags">
													<span>
														Ziel:{' '}
														{targetPct != null
															? `${targetPct}% (${formatEUR(pt.targetCents ?? 0)})`
															: '—'}
													</span>
													<span>
														Bereich:{' '}
														{pt.targetMin != null
															? formatEUR(pt.targetMin)
															: '—'}{' '}
														–{' '}
														{pt.targetMax != null
															? formatEUR(pt.targetMax)
															: '—'}
													</span>
													<span>
														Rendite:{' '}
														{formatPercent(pt.pool.expectedReturnBps)}{' '}
														p.a.
													</span>
													<span>
														Risiko: {formatRiskLevel(pt.pool.riskLevel)}
													</span>
													<span>
														Horizont:{' '}
														{pt.pool.horizonMonths != null
															? `${pt.pool.horizonMonths} Monate`
															: '—'}
													</span>
													<span
														class="pool-status"
														classList={{
															'pool-status--ok': ok,
															'pool-status--warn': !ok,
														}}
													>
														{ok ? '✓ im Ziel' : '⚠ abweichend'}
													</span>
												</div>
												<div class="pool-bar">
													<div
														class="pool-bar-fill"
														classList={{
															'pool-bar-fill--ok': ok,
															'pool-bar-fill--warn': !ok,
														}}
														style={{
															width: `${Math.min(100, pct * 2)}%`,
														}}
													/>
													<Show when={targetPct != null}>
														<div
															class="pool-target"
															style={{
																left: `${Math.min(100, targetPct ?? 0)}%`,
															}}
															title={`Ziel ${targetPct}%`}
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
								<h2 class="dashboard-section-title">Nächste 90 Tage · Cashflow</h2>
								<Show when={data().upcomingEvents.length === 0}>
									<p class="muted text-sm">Keine Ereignisse im Zeitraum.</p>
								</Show>
								<div class="list list--tight">
									<For each={data().upcomingEvents}>
										{(ev) => {
											const d =
												(ev as { projectedDate?: string }).projectedDate ??
												ev.date
											return (
												<div class="timeline-row">
													<div>
														<div class="timeline-title">{ev.title}</div>
														<div class="pool-sub">
															{formatDateISO(d)}
															<Show when={ev.isRecurring}>
																{' '}
																· {ev.frequency} ↻
															</Show>
														</div>
													</div>
													<div
														class="timeline-amount"
														classList={{
															'amount--in': ev.direction === 'inflow',
															'amount--out':
																ev.direction !== 'inflow',
														}}
													>
														{ev.direction === 'inflow' ? '+' : '−'}
														{formatEUR(ev.amountCents)}
													</div>
												</div>
											)
										}}
									</For>
								</div>
							</section>

							<section class="dashboard-card">
								<h2 class="dashboard-section-title">Verfügbar ab</h2>
								<Show when={data().unlocks.length === 0}>
									<p class="muted text-sm">
										Nichts gesperrt in Festgeld / Zuweisungen.
									</p>
								</Show>
								<div class="list list--tight">
									<For each={data().unlocks}>
										{(u) => (
											<div class="unlock-row">
												<div>
													<div class="timeline-title">{u.name}</div>
													<div class="pool-sub">
														{formatDateISO(u.unlockAt)}
													</div>
												</div>
												<div class="unlock-amount">
													{formatEUR(u.amountCents)}
												</div>
											</div>
										)}
									</For>
								</div>
							</section>
						</div>
					</>
				)}
			</Show>
		</div>
	)
}
