import { isIP } from 'node:net'
import { createMiddleware } from 'hono/factory'
import { getDb } from '../db'
import { loginAuditLogs } from '../schema'
import type { AppEnv } from './auth'
import { clientIp } from './rate-limit'

/** Runs before validation so malformed and rate-limited submissions are also recorded. */
export const auditLogin = createMiddleware<AppEnv>(async (c, next) => {
	const occurredAt = Date.now()
	const body: unknown = await c.req.json().catch(() => null)
	const username =
		body && typeof body === 'object' && 'username' in body && typeof body.username === 'string'
			? body.username.trim().slice(0, 100)
			: null
	const ip = clientIp(c)
	await next()
	getDb()
		.insert(loginAuditLogs)
		.values({
			occurredAt,
			username,
			sourceIp: isIP(ip) ? ip : null,
			outcome: c.res.status === 200 ? 'success' : 'failure',
			status: c.res.status,
		})
		.run()
})
