import type { AccountType, LiquidityTier } from './enums'
import { FIXED_LOCALE_TAG, t } from './i18n'

/**
 * Number/currency formatting is ALWAYS de-DE, independent of the UI
 * language. Dates are ALWAYS ISO `YYYY-MM-DD` (see {@link formatDateISO}).
 */
const FIXED_TAG = FIXED_LOCALE_TAG

/**
 * Label/color maps below are keyed by the shared enum types (`./enums`).
 * The intersected `Record<string, string>` keeps plain-`string` indexing
 * (e.g. `Object.entries(...)` keys in components) compiling without casts.
 */
export function formatEUR(cents: number): string {
	return new Intl.NumberFormat(FIXED_TAG, {
		style: 'currency',
		currency: 'EUR',
	}).format(cents / 100)
}

/**
 * Currency-aware money formatting for the Currencies page (EUR + USD only
 * for now). Falls back to EUR formatting for unknown codes.
 */
export function formatMoney(cents: number, code: string): string {
	try {
		return new Intl.NumberFormat(FIXED_TAG, {
			style: 'currency',
			currency: code,
		}).format(cents / 100)
	} catch {
		return formatEUR(cents)
	}
}

/** Exchange-rate formatting (4 decimals, ALWAYS de-DE): `1,1616`. */
export function formatRate(rate: number, digits = 4): string {
	if (!Number.isFinite(rate)) {
		return '—'
	}
	return new Intl.NumberFormat(FIXED_TAG, {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits,
	}).format(rate)
}

/** Fallback symbols when a currency row is not loaded yet. */
export function currencySymbol(code: string): string {
	if (code === 'EUR') {
		return '€'
	}
	if (code === 'USD') {
		return '$'
	}
	return code
}

export function formatPercent(bps: number | null | undefined): string {
	if (bps == null) {
		return '—'
	}
	return new Intl.NumberFormat(FIXED_TAG, {
		style: 'percent',
		maximumFractionDigits: 2,
	}).format(bps / 10_000)
}

/** Format an already-computed percent value (e.g. share of total), ALWAYS de-DE. */
export function formatShare(pct: number): string {
	return new Intl.NumberFormat(FIXED_TAG, {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	}).format(pct)
}

/** Format a target percent that may carry more precision, trimming zeros. ALWAYS de-DE. */
export function formatTargetPercent(pct: number): string {
	return `${new Intl.NumberFormat(FIXED_TAG, { maximumFractionDigits: 2 }).format(pct)} %`
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

/** Display-only: render a backend ISO date ALWAYS as `YYYY-MM-DD` (no locale). */
export function formatDateISO(dateStr: string): string {
	try {
		if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
			return dateStr.slice(0, 10)
		}
		const d = new Date(dateStr)
		if (Number.isNaN(d.getTime())) {
			return dateStr
		}
		const y = d.getFullYear()
		const m = String(d.getMonth() + 1).padStart(2, '0')
		const day = String(d.getDate()).padStart(2, '0')
		return `${y}-${m}-${day}`
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

/**
 * Shift an ISO `YYYY-MM-DD` date by `deltaDays` (local time, no UTC shift).
 * Shared with {@link todayISO} so callers never hand-roll `Date` math.
 */
export function addDaysISO(iso: string, deltaDays: number): string {
	const [y, m, d] = iso.split('-').map(Number)
	const dt = new Date(y, (m || 1) - 1, d || 1)
	dt.setDate(dt.getDate() + deltaDays)
	return todayISO(dt)
}

/**
 * Inclusive day count between two ISO `YYYY-MM-DD` dates
 * (`2024-01-01` → `2024-01-01` is `1`). Used to validate download ranges.
 */
export function diffDaysISO(fromISO: string, toISO: string): number {
	return (
		Math.round(
			(new Date(`${toISO}T00:00:00Z`).getTime() -
				new Date(`${fromISO}T00:00:00Z`).getTime()) /
				86_400_000,
		) + 1
	)
}

export const liquidityColors: Record<LiquidityTier, string> & Record<string, string> = {
	instant: '#22c55e',
	days: '#3b82f6',
	weeks: '#f59e0b',
	months: '#8b5cf6',
	locked: '#ef4444',
}

/** Reactive, locale-aware label lookups. Use these in components. */
export function liquidityLabel(tier: string): string {
	return (t().liquidity as Record<string, string>)[tier] ?? tier
}

export function accountTypeLabel(type: string): string {
	return (t().accountType as Record<string, string>)[type] ?? type
}

export function accountTypeDescription(type: string): string {
	return (t().accountTypeDesc as Record<string, string>)[type] ?? ''
}

export function riskLevelLabel(level: number): string {
	return t().riskLevel[level] ?? '—'
}

/** Month label for a `YYYY-MM` group key — ALWAYS the raw `YYYY-MM` key. */
export function formatMonthKey(key: string): string {
	return key.slice(0, 7)
}

/**
 * @deprecated Use {@link liquidityLabel} for locale-aware labels.
 * Kept for backwards compatibility (German values).
 */
export const liquidityLabels: Record<LiquidityTier, string> & Record<string, string> = {
	instant: 'Sofort',
	days: 'Tage',
	weeks: 'Wochen',
	months: 'Monate',
	locked: 'Gebunden',
}

/**
 * @deprecated Use {@link accountTypeLabel} for locale-aware labels.
 */
export const accountTypeLabels: Record<AccountType, string> & Record<string, string> = {
	checking: 'Checking',
	savings: 'Savings',
	broker: 'Broker',
	crypto: 'Crypto',
	other: 'Other',
}

/**
 * @deprecated Use {@link accountTypeDescription} for locale-aware descriptions.
 */
export const accountTypeDescriptions: Record<AccountType, string> & Record<string, string> = {
	checking: 'Everyday account for income, bills and daily spending.',
	savings:
		'Savings with flexible access or as fixed-term deposit with locked interest until maturity.',
	broker: 'Broker account for stocks, ETFs and other securities.',
	crypto: 'Digital assets in a wallet or on an exchange.',
	other: 'Any other account that fits no category.',
}

/**
 * @deprecated Use {@link riskLevelLabel} for locale-aware labels.
 */
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
	return riskLevelLabel(level) ?? '—'
}
