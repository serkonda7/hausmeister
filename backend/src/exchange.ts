import type { CurrencyCode } from '@homie/contracts'
import { currencyCodeEnum } from '@homie/contracts'

// Single trustful internet source for exchange rates: the frankfurter.app
// v2 API (https://frankfurter.dev) — open-source, no key, backed by ECB and
// other central-bank data. We scope to the official ECB provider feed:
//
//   GET /v2/providers/ecb/rates?from={start}&to={end}&quotes=usd
//   → [{ "date": "2026-09-10", "base": "EUR", "quote": "USD", "rate": 1.1616 }, …]
//
// We only support EUR + USD for now and always store the EUR→USD fixing;
// USD→EUR is derived as the inverse on read.

export const FRANKFURTER_API = 'https://api.frankfurter.dev/v2'
export const RATE_SOURCE = 'frankfurter.app'

export interface DownloadedRate {
	date: string // YYYY-MM-DD (fixing date)
	eurUsd: number // USD per 1 EUR
}

function isCode(value: unknown): value is CurrencyCode {
	return typeof value === 'string' && (currencyCodeEnum as readonly string[]).includes(value)
}

export function normalizeCode(value: unknown): CurrencyCode | null {
	if (typeof value !== 'string') {
		return null
	}
	const upper = value.trim().toUpperCase()
	return isCode(upper) ? upper : null
}

function isoDaysAgo(days: number): string {
	const d = new Date()
	d.setDate(d.getDate() - days)
	return d.toISOString().slice(0, 10)
}

/** Download the last `days` EUR→USD ECB fixings via frankfurter v2. */
export async function downloadEurUsdRates(days: number): Promise<{
	rates: DownloadedRate[]
	source: string
}> {
	const windowDays = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), 365) : 90
	const end = isoDaysAgo(0)
	const start = isoDaysAgo(windowDays)
	const res = await fetch(
		`${FRANKFURTER_API}/providers/ecb/rates?from=${start}&to=${end}&quotes=usd`,
		{
			headers: { Accept: 'application/json', 'User-Agent': 'homie (frankfurter.app client)' },
			signal: AbortSignal.timeout(15_000),
		},
	)
	if (!res.ok) {
		throw new Error(`frankfurter.app request failed: ${res.status}`)
	}
	const data = (await res.json()) as Array<{
		date?: unknown
		base?: unknown
		quote?: unknown
		rate?: unknown
	}>
	const rates: DownloadedRate[] = []
	for (const row of Array.isArray(data) ? data : []) {
		const { date, base, quote, rate } = row
		if (
			typeof date !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			base !== 'EUR' ||
			quote !== 'USD' ||
			typeof rate !== 'number' ||
			!Number.isFinite(rate) ||
			rate <= 0
		) {
			continue
		}
		rates.push({ date, eurUsd: rate })
	}
	rates.sort((a, b) => a.date.localeCompare(b.date))
	if (rates.length === 0) {
		throw new Error('frankfurter.app response contained no USD rates')
	}
	return { rates, source: RATE_SOURCE }
}
