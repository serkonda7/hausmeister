import { and, desc, eq, lt, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { getDb } from '../db'
import { loginAuditLogs } from '../schema'
import { type AppEnv, requireAdmin } from '../util/auth'
import { fail } from '../util/http'

const PAGE_SIZE = 50

export const auditLogApp = new Hono<AppEnv>().use(requireAdmin).get('/', (c) => {
	const before = c.req.query('before')
	let cursor: { occurredAt: number; id: number } | undefined
	if (before !== undefined) {
		const match = /^(\d+):(\d+)$/.exec(before)
		if (!match) fail(400, 'Invalid audit log cursor')
		cursor = { occurredAt: Number(match[1]), id: Number(match[2]) }
		if (!Number.isSafeInteger(cursor.occurredAt) || !Number.isSafeInteger(cursor.id)) {
			fail(400, 'Invalid audit log cursor')
		}
	}
	const rows = getDb()
		.select()
		.from(loginAuditLogs)
		.where(
			cursor
				? or(
						lt(loginAuditLogs.occurredAt, cursor.occurredAt),
						and(eq(loginAuditLogs.occurredAt, cursor.occurredAt), lt(loginAuditLogs.id, cursor.id)),
					)
				: undefined,
		)
		.orderBy(desc(loginAuditLogs.occurredAt), desc(loginAuditLogs.id))
		.limit(PAGE_SIZE + 1)
		.all()
	const entries = rows.slice(0, PAGE_SIZE)
	const last = entries.at(-1)
	c.header('Cache-Control', 'no-store')
	return c.json({
		entries,
		nextCursor: rows.length > PAGE_SIZE && last ? `${last.occurredAt}:${last.id}` : null,
	})
})
