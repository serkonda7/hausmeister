// Warranty expiry (DESIGN §5.6): which items have a warranty end (a `date` field with `warranty: true`, own or inherited), and the daily reminder.
// Every day at 08:00 Europe/Berlin the job "reminders.warranty" gives each manager of an item (managerAudience: owner or owning group, admins for household items, manage grantees) one inbox notice when a warranty ends within WARRANTY_NOTICE_DAYS days.
// One notice per person, item, field and end date, read or not: a later run (or a restart) never repeats it; moving the date sends a new one.
// Gone items (archived, given away, sold, disposed) get none.
// Runs from the job worker the startup plugin starts, so it reads the stored field JSON itself instead of going through the item-type helpers (relative imports only).
import { and, eq, inArray, notInArray, type SQL, sql } from 'drizzle-orm'
import { isoDayInBerlin } from '../../lib/format'
import { GONE_STATUSES } from '../../lib/items/constants'
import { addDays, WARRANTY_NOTICE_DAYS } from '../../lib/warranty'
import type { AppDb, DbOrTx } from '../db/client'
import { items, itemTypes, notifications } from '../db/schema'
import { nextDailyInBerlin } from '../jobs/schedule'
import { addJobHandler, type JobRegistry } from '../jobs/worker'
import { managerAudience, notify } from '../notifications/service'

export const WARRANTY_JOB = 'reminders.warranty'
export const WARRANTY_KIND = 'warranty.ending'

const KEY = /^[a-z][a-z0-9_]{0,47}$/

type TypeRow = { id: string; parentId: string | null; fields: unknown }
type WarrantyField = { key: string; hidden: boolean }

function ownWarrantyFields(raw: unknown): WarrantyField[] {
	if (!Array.isArray(raw)) return []
	const out: WarrantyField[] = []
	for (const f of raw as {
		key?: unknown
		kind?: unknown
		warranty?: unknown
		hidden?: unknown
	}[])
		if (
			f &&
			f.kind === 'date' &&
			f.warranty === true &&
			typeof f.key === 'string' &&
			KEY.test(f.key)
		)
			out.push({ key: f.key, hidden: f.hidden === true })
	return out
}

/** Type id -> keys of its active warranty fields, inherited ones included. */
export function warrantyKeysByType(rows: readonly TypeRow[]): Map<string, string[]> {
	const byId = new Map(rows.map((r) => [r.id, r]))
	const out = new Map<string, string[]>()
	for (const r of rows) {
		const keys: string[] = []
		const seen = new Set<string>()
		for (let t: TypeRow | undefined = r; t && !seen.has(t.id); t = byId.get(t.parentId ?? '')) {
			seen.add(t.id)
			for (const f of ownWarrantyFields(t.fields)) if (!f.hidden) keys.push(f.key)
		}
		if (keys.length) out.set(r.id, [...new Set(keys)])
	}
	return out
}

export function loadWarrantyKeys(db: DbOrTx): Map<string, string[]> {
	return warrantyKeysByType(
		db
			.select({ id: itemTypes.id, parentId: itemTypes.parentId, fields: itemTypes.fields })
			.from(itemTypes)
			.all(),
	)
}

/** Items with a warranty ending between `from` and `to` (inclusive, 'YYYY-MM-DD'); null when no type has a warranty field. */
export function warrantyEndsBetweenWhere(
	keys: ReadonlyMap<string, string[]>,
	from: string,
	to: string,
): SQL | null {
	const typesByKey = new Map<string, string[]>()
	for (const [typeId, ks] of keys)
		for (const k of ks) typesByKey.set(k, [...(typesByKey.get(k) ?? []), typeId])
	if (typesByKey.size === 0) return null
	const parts = [...typesByKey].map(
		([key, typeIds]) =>
			and(
				inArray(items.typeId, typeIds),
				sql`json_extract(${items.attributes}, ${`$."${key}"`}) between ${from} and ${to}`,
			) as SQL,
	)
	return parts.length === 1 ? parts[0]! : (sql`(${sql.join(parts, sql` or `)})` as SQL)
}

/** Sends the notices that are due on `today`. Returns how many were added. */
export function sendWarrantyNotices(db: AppDb, today: string = isoDayInBerlin()): number {
	const end = addDays(today, WARRANTY_NOTICE_DAYS)
	const keys = loadWarrantyKeys(db)
	const where = warrantyEndsBetweenWhere(keys, today, end)
	if (!where) return 0
	const rows = db
		.select({
			id: items.id,
			typeId: items.typeId,
			ownerKind: items.ownerKind,
			ownerId: items.ownerId,
			attributes: items.attributes,
		})
		.from(items)
		.where(and(where, notInArray(items.status, [...GONE_STATUSES])))
		.all()
	let sent = 0
	for (const it of rows)
		db.transaction((tx) => {
			for (const key of keys.get(it.typeId) ?? []) {
				const until = it.attributes?.[key]
				if (typeof until !== 'string' || until < today || until > end) continue
				const already = new Set(
					tx
						.select({ u: notifications.userId })
						.from(notifications)
						.where(
							and(
								eq(notifications.itemId, it.id),
								eq(notifications.kind, WARRANTY_KIND),
								sql`json_extract(${notifications.payload}, '$.until') = ${until}`,
								sql`json_extract(${notifications.payload}, '$.field') = ${key}`,
							),
						)
						.all()
						.map((r) => r.u),
				)
				sent += notify(tx, {
					userIds: managerAudience(tx, it).filter((u) => !already.has(u)),
					kind: WARRANTY_KIND,
					itemId: it.id,
					payload: { until, field: key },
				})
			}
		})
	return sent
}

export function addWarrantyJobs(registry: JobRegistry) {
	addJobHandler(
		registry,
		WARRANTY_JOB,
		(_payload, { db }) => {
			const n = sendWarrantyNotices(db)
			if (n) console.log(`[warranty] ${n} reminder(s) sent`)
		},
		{ maxAttempts: 3, recurring: { next: (now) => nextDailyInBerlin(now, 8) } },
	)
}
