import type { AccountType, LiquidityTier } from './enums'

/**
 * Label/color maps below are keyed by the shared enum types (`./enums`).
 * The intersected `Record<string, string>` keeps plain-`string` indexing
 * (e.g. `Object.entries(...)` keys in components) compiling without casts.
 */
export function formatEUR(cents: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(
		cents / 100,
	)
}

export function formatPercent(bps: number | null | undefined): string {
	if (bps == null) {
		return '—'
	}
	return `${(bps / 100).toFixed(2)}%`
}

/**
 * Dates: display vs. input (single place documenting both).
 *
 * - Display: {@link formatDateISO} renders a backend ISO date for reading.
 * - Editing: `<DateInput>` (`../components/DateInput.tsx`, native
 *   `<input type="date">`) edits ISO dates (`YYYY-MM-DD` or `''`), matching
 *   the backend contract. Use it for every date field instead of a plain
 *   text/number input.
 * - Defaults: {@link todayISO} provides the initial value for a new
 *   `<DateInput>`.
 *
 * Never use `new Date().toISOString().slice(0, 10)` for defaults — it shifts
 * the day in timezones ahead of UTC. {@link todayISO} uses local time.
 */

/** Display-only: render a backend ISO date (`YYYY-MM-DD…`) for reading. */
export function formatDateISO(dateStr: string): string {
	try {
		if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
			return dateStr.slice(0, 10)
		}
		return new Date(dateStr).toISOString().slice(0, 10)
	} catch {
		return dateStr
	}
}

/**
 * Input-default-only: today's date as ISO `YYYY-MM-DD` in local time (no UTC
 * shift). Use as the initial `value` for `<DateInput>`
 * (`../components/DateInput.tsx`); use {@link formatDateISO} for display.
 */
export function todayISO(d = new Date()): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

export const liquidityLabels: Record<LiquidityTier, string> & Record<string, string> = {
	instant: 'Instant',
	days: 'Days',
	weeks: 'Weeks',
	months: 'Months',
	locked: 'Locked',
}

export const liquidityColors: Record<LiquidityTier, string> & Record<string, string> = {
	instant: '#22c55e',
	days: '#3b82f6',
	weeks: '#f59e0b',
	months: '#8b5cf6',
	locked: '#ef4444',
}

export const accountTypeLabels: Record<AccountType, string> & Record<string, string> = {
	checking: 'Checking',
	savings: 'Savings',
	broker: 'Broker',
	cash: 'Cash',
	crypto: 'Crypto',
	festgeld: 'Fixed-term deposit',
	other: 'Other',
}

export const accountTypeDescriptions: Record<AccountType, string> & Record<string, string> = {
	checking: 'Everyday account for income, bills and daily spending.',
	savings: 'Long-term savings with modest interest and flexible access.',
	broker: 'Securities account for stocks, ETFs and other investments.',
	cash: 'Physical cash held outside of any bank account.',
	crypto: 'Digital assets held in a wallet or on an exchange.',
	festgeld: 'Fixed-term deposit with locked interest until maturity.',
	other: 'Any other account that fits no category above.',
}

export const riskLevelLabels: Record<number, string> = {
	1: 'Very low',
	2: 'Low',
	3: 'Medium',
	4: 'High',
	5: 'Very high',
}

export function formatRiskLevel(level: number | null | undefined): string {
	if (level == null) {
		return '—'
	}
	return riskLevelLabels[level] ?? '—'
}
