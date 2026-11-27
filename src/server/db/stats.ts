import { count } from 'drizzle-orm'
import type { AppDb } from './client'
import { boots } from './schema'

/**
 * The public /health answer: only what the Docker healthcheck (status code)
 * and deploy/restore-test.sh (`ok`, `boots`) need. No item counts, no versions.
 */
export function healthStatus(db: AppDb): { ok: true; boots: number } {
	return { ok: true, boots: db.select({ n: count() }).from(boots).get()?.n ?? 0 }
}
