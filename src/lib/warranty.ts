// Warranty expiry (DESIGN §5.6): a `date` field with `warranty: true` holds the day an item's warranty ends ("Garantie bis").
// The daily reminder job (src/server/warranty/reminders.ts) tells the item's managers WARRANTY_NOTICE_DAYS days ahead; the item page and the "Garantie endet bald" list use the same window.
// Days are calendar days in Europe/Berlin ('YYYY-MM-DD'); the end day itself still counts as covered.

export const WARRANTY_NOTICE_DAYS = 30

const DAY_MS = 86_400_000
const utcDay = (day: string) => Date.parse(`${day}T00:00:00Z`)

/** 'YYYY-MM-DD' plus n calendar days. */
export function addDays(day: string, n: number): string {
	return new Date(utcDay(day) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Calendar days from `today` to `day` (negative when it is past). */
export function daysBetween(today: string, day: string): number {
	return Math.round((utcDay(day) - utcDay(today)) / DAY_MS)
}

export type WarrantyState =
	| { state: 'active'; daysLeft: number }
	| { state: 'ending'; daysLeft: number }
	| { state: 'expired'; daysAgo: number }

/** Where a warranty ending on `until` stands on `today`; null for a malformed day. */
export function warrantyState(until: unknown, today: string): WarrantyState | null {
	if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null
	const left = daysBetween(today, until)
	if (Number.isNaN(left)) return null
	if (left < 0) return { state: 'expired', daysAgo: -left }
	return left <= WARRANTY_NOTICE_DAYS
		? { state: 'ending', daysLeft: left }
		: { state: 'active', daysLeft: left }
}
