/**
 * Euro ↔ cents conversion for form inputs.
 *
 * Backend contract: money is an integer number of cents (`amountCents`).
 * Form inputs are decimal strings (`"12.34"`). These two helpers are the
 * single place that converts between the two — use them in every form
 * instead of inlining `Math.round(parseFloat(...) * 100)` /
 * `(cents / 100).toString()`, which previously existed in five subtly
 * inconsistent variants (notably `''` becoming `0` in some forms).
 */

/**
 * Parse a decimal euro input (`"12.34"`) to integer cents (`1234`).
 *
 * - Empty / whitespace-only input → `null` (field left blank, i.e. "no value").
 * - Anything else → `Math.round(parseFloat(s) * 100)`, which is `NaN`
 *   when the input is not a number (caller must treat `NaN` as invalid).
 */
export function parseEuroToCents(s: string): number | null {
	if (s.trim() === '') {
		return null
	}
	return Math.round(Number.parseFloat(s) * 100)
}

/**
 * Parse a decimal euro input to integer cents, accepting only positive
 * amounts. Returns `null` for blank / non-numeric / zero / negative input —
 * the shared "date + amount" validation used by the transaction and transfer
 * submit handlers (both report the same `dateAmountRequired` error).
 */
export function parsePositiveCents(s: string): number | null {
	const cents = parseEuroToCents(s)
	if (cents == null || Number.isNaN(cents) || cents <= 0) {
		return null
	}
	return cents
}

/**
 * Format integer cents (`1234`) for a decimal euro input (`"12.34"`).
 * `null` / `undefined` → `''` (empty input).
 */
export function centsToEuroInput(cents: number | null | undefined): string {
	if (cents == null) {
		return ''
	}
	return (cents / 100).toString()
}
