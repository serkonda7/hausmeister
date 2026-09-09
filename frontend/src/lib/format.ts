import type { AccountType, LiquidityTier } from './enums'

/**
 * Label/color maps below are keyed by the shared enum types (`./enums`).
 * The intersected `Record<string, string>` keeps plain-`string` indexing
 * (e.g. `Object.entries(...)` keys in components) compiling without casts.
 */
export function formatEUR(cents: number): string {
	return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
		cents / 100,
	)
}

export function formatPercent(bps: number | null | undefined): string {
	if (bps == null) {
		return '—'
	}
	return new Intl.NumberFormat('de-DE', {
		style: 'percent',
		maximumFractionDigits: 2,
	}).format(bps / 10_000)
}

/** Format an already-computed percent value (e.g. share of total) in de-DE. */
export function formatShare(pct: number): string {
	return new Intl.NumberFormat('de-DE', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(pct)
}

/** Format a target percent that may carry more precision, trimming zeros. */
export function formatTargetPercent(pct: number): string {
	return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(pct)} %`
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

/** Display-only: render a backend ISO date (`YYYY-MM-DD…`) in de-DE for reading. */
export function formatDateISO(dateStr: string): string {
	const fmt = new Intl.DateTimeFormat('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	})
	try {
		if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
			const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
			return fmt.format(new Date(y, m - 1, d))
		}
		return fmt.format(new Date(dateStr))
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
	instant: 'Sofort',
	days: 'Tage',
	weeks: 'Wochen',
	months: 'Monate',
	locked: 'Gebunden',
}

export const liquidityColors: Record<LiquidityTier, string> & Record<string, string> = {
	instant: '#22c55e',
	days: '#3b82f6',
	weeks: '#f59e0b',
	months: '#8b5cf6',
	locked: '#ef4444',
}

export const accountTypeLabels: Record<AccountType, string> & Record<string, string> = {
	checking: 'Girokonto',
	savings: 'Sparkonto',
	broker: 'Depot',
	cash: 'Bargeld',
	crypto: 'Krypto',
	festgeld: 'Festgeld',
	other: 'Sonstiges',
}

export const accountTypeDescriptions: Record<AccountType, string> & Record<string, string> = {
	checking: 'Alltagskonto für Einnahmen, Rechnungen und tägliche Ausgaben.',
	savings: 'Langfristige Ersparnisse mit moderaten Zinsen und flexiblem Zugriff.',
	broker: 'Wertpapierdepot für Aktien, ETFs und andere Anlagen.',
	cash: 'Physisches Bargeld außerhalb eines Bankkontos.',
	crypto: 'Digitale Vermögenswerte in einer Wallet oder auf einer Börse.',
	festgeld: 'Festgeld mit gebundenen Zinsen bis zur Fälligkeit.',
	other: 'Jedes andere Konto, das in keine Kategorie passt.',
}

export const riskLevelLabels: Record<number, string> = {
	1: 'Sehr niedrig',
	2: 'Niedrig',
	3: 'Mittel',
	4: 'Hoch',
	5: 'Sehr hoch',
}

export function formatRiskLevel(level: number | null | undefined): string {
	if (level == null) {
		return '—'
	}
	return riskLevelLabels[level] ?? '—'
}
