import { createEffect, createResource, For, Show } from 'solid-js'
import { api } from '../lib/api'
import {
	formatDateISO,
	formatEUR,
	formatPercent,
	liquidityColors,
	liquidityLabels,
} from '../lib/format'

export default function Dashboard() {
	const [summary, { refetch }] = createResource(() => api.summary())

	// refetch on focus
	createEffect(() => {
		const h = () => refetch()
		window.addEventListener('focus', h)
		return () => window.removeEventListener('focus', h)
	})

	return (
		<div style={{ display: 'grid', gap: '1.25rem' }}>
			<Show when={summary.loading}>
				<p style={{ color: 'var(--muted)' }}>Laden…</p>
			</Show>
			<Show when={summary.error}>
				<p style={{ color: 'var(--error)' }}>Fehler: {(summary.error as Error).message}</p>
			</Show>
			<Show when={summary()}>
				{(data) => (
					<>
						{/* Total */}
						<section
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								'border-radius': '12px',
								padding: '1.25rem',
							}}
						>
							<div
								style={{
									color: 'var(--muted)',
									'font-size': '0.875rem',
									'text-transform': 'uppercase',
									'letter-spacing': '0.05em',
								}}
							>
								Gesamtvermögen
							</div>
							<div
								style={{
									'font-size': '2rem',
									'font-weight': '700',
									'margin-top': '0.25rem',
								}}
							>
								{formatEUR(data().totalCents)}
							</div>
							<div
								style={{
									color: 'var(--muted)',
									'font-size': '0.875rem',
									'margin-top': '0.25rem',
								}}
							>
								{data().counts.accounts} Konten · {data().counts.pools} Pools ·{' '}
								{data().counts.allocations} Zuweisungen
							</div>
						</section>

						{/* Liquidity */}
						<section
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								'border-radius': '12px',
								padding: '1.25rem',
							}}
						>
							<h2
								style={{
									margin: '0 0 1rem',
									'font-size': '1rem',
									'font-weight': '600',
								}}
							>
								Verfügbarkeit
							</h2>
							<div style={{ display: 'grid', gap: '0.75rem' }}>
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
												<div
													style={{
														display: 'flex',
														'justify-content': 'space-between',
														'font-size': '0.875rem',
													}}
												>
													<span>{liquidityLabels[tier] ?? tier}</span>
													<span style={{ color: 'var(--muted)' }}>
														{formatEUR(cents)} · {pct.toFixed(1)}%
													</span>
												</div>
												<div
													style={{
														height: '8px',
														background: 'var(--surface-2)',
														'border-radius': '999px',
														'margin-top': '0.35rem',
														overflow: 'hidden',
													}}
												>
													<div
														style={{
															width: `${pct}%`,
															height: '100%',
															background:
																liquidityColors[tier] ?? '#9ca3af',
															'border-radius': '999px',
															transition: 'width 0.3s',
														}}
													/>
												</div>
											</div>
										)
									}}
								</For>
							</div>
							<p
								style={{
									color: 'var(--muted)',
									'font-size': '0.75rem',
									'margin-top': '0.75rem',
								}}
							>
								Effektiv: Override auf Zuweisung schlägt Konto-Default. Restguthaben
								zählt zum Konto-Tier.
							</p>
						</section>

						{/* Pools vs Target */}
						<section
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								'border-radius': '12px',
								padding: '1.25rem',
							}}
						>
							<h2
								style={{
									margin: '0 0 1rem',
									'font-size': '1rem',
									'font-weight': '600',
								}}
							>
								Pools · Ziel vs. Ist
							</h2>
							<Show when={data().poolTotals.length === 0}>
								<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
									Noch keine Pools angelegt. Lege einen Pool in „Pools“ an.
								</p>
							</Show>
							<div style={{ display: 'grid', gap: '1rem' }}>
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
											<div
												style={{
													border: '1px solid var(--surface-2)',
													'border-radius': '10px',
													padding: '0.9rem',
												}}
											>
												<div
													style={{
														display: 'flex',
														'justify-content': 'space-between',
														'align-items': 'center',
													}}
												>
													<div>
														<div
															style={{
																'font-weight': '600',
																display: 'flex',
																gap: '0.5rem',
																'align-items': 'center',
															}}
														>
															<span
																style={{
																	display: 'inline-block',
																	width: '10px',
																	height: '10px',
																	'border-radius': '999px',
																	background:
																		pt.pool.color ?? '#9ca3af',
																}}
															/>
															{pt.pool.name}
														</div>
														<Show when={pt.pool.purpose}>
															<div
																style={{
																	color: 'var(--muted)',
																	'font-size': '0.8rem',
																}}
															>
																{pt.pool.purpose}
															</div>
														</Show>
													</div>
													<div style={{ 'text-align': 'right' }}>
														<div style={{ 'font-weight': '600' }}>
															{formatEUR(pt.currentCents)}
														</div>
														<div
															style={{
																color: 'var(--muted)',
																'font-size': '0.75rem',
															}}
														>
															{pct.toFixed(1)}% des Gesamt
														</div>
													</div>
												</div>
												<div
													style={{
														display: 'flex',
														gap: '1rem',
														'margin-top': '0.5rem',
														'font-size': '0.75rem',
														color: 'var(--muted)',
														'flex-wrap': 'wrap',
													}}
												>
													<span>
														Ziel:{' '}
														{targetPct != null
															? `${targetPct}% (${formatEUR(pt.targetCents ?? 0)})`
															: '—'}
													</span>
													<span>
														Range:{' '}
														{pt.targetMin != null
															? formatEUR(pt.targetMin)
															: '—'}{' '}
														–{' '}
														{pt.targetMax != null
															? formatEUR(pt.targetMax)
															: '—'}
													</span>
													<span>
														Erwartung:{' '}
														{formatPercent(pt.pool.expectedReturnBps)}{' '}
														p.a.
													</span>
													<span>
														Risiko: {pt.pool.riskLevel ?? '—'} / 5
													</span>
													<span>
														Horizont:{' '}
														{pt.pool.horizonMonths != null
															? `${pt.pool.horizonMonths} M`
															: '—'}
													</span>
													<span
														style={{
															'margin-left': 'auto',
															color: ok
																? 'var(--success)'
																: 'var(--warning)',
															'font-weight': '600',
														}}
													>
														{ok ? '✓ im Ziel' : '⚠ abweichend'}
													</span>
												</div>
												<div
													style={{
														height: '6px',
														background: 'var(--surface-2)',
														'border-radius': '999px',
														'margin-top': '0.6rem',
														position: 'relative',
													}}
												>
													<div
														style={{
															width: `${Math.min(100, pct * 2)}%`,
															// pct bar scaled: 50% = full width. Better: pct relative to 100
															height: '100%',
															background: ok
																? 'var(--success-bright)'
																: 'var(--warning-bright)',
															'border-radius': '999px',
														}}
													/>
													<Show when={targetPct != null}>
														<div
															style={{
																position: 'absolute',
																left: `${Math.min(100, targetPct ?? 0)}%`,
																top: '-2px',
																width: '2px',
																height: '10px',
																background: 'var(--primary)',
																'border-radius': '1px',
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

						{/* Timeline two cols */}
						<div
							style={{
								display: 'grid',
								gap: '1.25rem',
								'grid-template-columns': 'repeat(auto-fit, minmax(320px, 1fr))',
							}}
						>
							<section
								style={{
									background: 'var(--surface)',
									border: '1px solid var(--border)',
									'border-radius': '12px',
									padding: '1.25rem',
								}}
							>
								<h2
									style={{
										margin: '0 0 1rem',
										'font-size': '1rem',
										'font-weight': '600',
									}}
								>
									Nächste 90 Tage · Cashflow
								</h2>
								<Show when={data().upcomingEvents.length === 0}>
									<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
										Keine Ereignisse im Zeitraum.
									</p>
								</Show>
								<div style={{ display: 'grid', gap: '0.6rem' }}>
									<For each={data().upcomingEvents}>
										{(ev) => {
											const d =
												(ev as { projectedDate?: string }).projectedDate ??
												ev.date
											return (
												<div
													style={{
														display: 'flex',
														'justify-content': 'space-between',
														'align-items': 'center',
														'font-size': '0.875rem',
													}}
												>
													<div>
														<div style={{ 'font-weight': '500' }}>
															{ev.title}
														</div>
														<div
															style={{
																color: 'var(--muted)',
																'font-size': '0.75rem',
															}}
														>
															{formatDateISO(d)}
															<Show when={ev.isRecurring}>
																{' '}
																· {ev.frequency} ↻
															</Show>
														</div>
													</div>
													<div
														style={{
															'font-weight': '600',
															color:
																ev.direction === 'inflow'
																	? 'var(--success)'
																	: 'var(--danger)',
															'white-space': 'nowrap',
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

							<section
								style={{
									background: 'var(--surface)',
									border: '1px solid var(--border)',
									'border-radius': '12px',
									padding: '1.25rem',
								}}
							>
								<h2
									style={{
										margin: '0 0 1rem',
										'font-size': '1rem',
										'font-weight': '600',
									}}
								>
									Verfügbar ab · Unlocks
								</h2>
								<Show when={data().unlocks.length === 0}>
									<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
										Nichts gesperrt. Festgeld/Allocations mit Datum erscheinen
										hier.
									</p>
								</Show>
								<div style={{ display: 'grid', gap: '0.6rem' }}>
									<For each={data().unlocks}>
										{(u) => (
											<div
												style={{
													display: 'flex',
													'justify-content': 'space-between',
													'font-size': '0.875rem',
												}}
											>
												<div>
													<div style={{ 'font-weight': '500' }}>
														{u.name}
													</div>
													<div
														style={{
															color: 'var(--muted)',
															'font-size': '0.75rem',
														}}
													>
														{formatDateISO(u.unlockAt)} · {u.type}
													</div>
												</div>
												<div style={{ 'font-weight': '600' }}>
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
