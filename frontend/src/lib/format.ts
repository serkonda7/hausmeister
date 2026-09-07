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

/** Today's date as ISO `YYYY-MM-DD` in local time (no UTC shift). */
export function todayISO(d = new Date()): string {
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

export const liquidityLabels: Record<string, string> = {
	instant: 'Instant',
	days: 'Days',
	weeks: 'Weeks',
	months: 'Months',
	locked: 'Locked',
}

export const liquidityColors: Record<string, string> = {
	instant: '#22c55e',
	days: '#3b82f6',
	weeks: '#f59e0b',
	months: '#8b5cf6',
	locked: '#ef4444',
}

export const accountTypeLabels: Record<string, string> = {
	checking: 'Checking',
	savings: 'Savings',
	broker: 'Broker',
	cash: 'Cash',
	crypto: 'Crypto',
	festgeld: 'Fixed-term deposit',
	other: 'Other',
}

export const accountTypeDescriptions: Record<string, string> = {
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
