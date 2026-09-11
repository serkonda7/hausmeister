import type { Summary } from './api'

export type PoolTotal = Summary['poolTotals'][number]

/** Share of `total` in percent (`0` when `total` is `0`). Pure — unit-testable. */
export function pct(cents: number, total: number): number {
	return total ? (cents / total) * 100 : 0
}

/**
 * Whether a pool is on target: within `[min, max]` and (when a percent
 * target exists) within 5 points of it. Pure — unit-testable.
 */
export function isOnTarget(pt: PoolTotal, sharePct: number): boolean {
	const targetPct = pt.targetPercent
	return (
		(pt.targetMin == null || pt.currentCents >= pt.targetMin) &&
		(pt.targetMax == null || pt.currentCents <= pt.targetMax) &&
		(targetPct == null || Math.abs(sharePct - targetPct) < 5)
	)
}
