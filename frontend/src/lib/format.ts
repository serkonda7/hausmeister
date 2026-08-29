export function formatEUR(cents: number): string {
	return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
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
		return new Date(dateStr).toLocaleDateString('de-DE')
	} catch {
		return dateStr
	}
}

export const liquidityLabels: Record<string, string> = {
	instant: 'Sofort',
	days: 'Tage',
	weeks: 'Wochen',
	months: 'Monate',
	locked: 'Gesperrt',
}

export const liquidityColors: Record<string, string> = {
	instant: '#22c55e',
	days: '#3b82f6',
	weeks: '#f59e0b',
	months: '#8b5cf6',
	locked: '#ef4444',
}

export const accountTypeLabels: Record<string, string> = {
	checking: 'Giro',
	savings: 'Sparen',
	broker: 'Depot',
	cash: 'Bargeld',
	crypto: 'Krypto',
	tagesgeld: 'Tagesgeld',
	festgeld: 'Festgeld',
	other: 'Sonstiges',
}
