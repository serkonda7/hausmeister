import type { Context } from 'hono'
import { fail } from './http'

/** Sliding-window attempt counter per key, kept in memory (resets on restart). */
export function createRateLimiter(limit: number, windowMs: number) {
	const attempts = new Map<string, number[]>()

	function recent(key: string, now: number): number[] {
		return (attempts.get(key) ?? []).filter((at) => at > now - windowMs)
	}

	/** Drop expired keys so failed attempts from many sources cannot grow the map forever. */
	function prune(now: number): void {
		for (const key of attempts.keys()) {
			if (recent(key, now).length === 0) attempts.delete(key)
		}
	}

	return {
		/**
		 * Count an attempt for every key, or fail with 429 (without counting) when any key is
		 * exhausted. Counting before the attempt runs keeps parallel requests from slipping through.
		 */
		consume(c: Context, keys: string[], now = Date.now()): void {
			const waits = keys.map((key) => {
				const list = recent(key, now)
				return list.length >= limit ? list[0] + windowMs - now : 0
			})
			const wait = Math.max(...waits)
			if (wait > 0) {
				c.header('Retry-After', String(Math.ceil(wait / 1000)))
				fail(429, 'Too many attempts, try again later')
			}
			if (attempts.size > 10_000) prune(now)
			for (const key of keys) attempts.set(key, [...recent(key, now), now])
		},
		/** Forget the attempts of `keys`, e.g. after a successful login. */
		reset(keys: string[]): void {
			for (const key of keys) attempts.delete(key)
		},
	}
}

/**
 * The client address as reported by the reverse proxy (Caddy sets `X-Forwarded-For`).
 * The backend only listens on loopback, so the header always comes from the proxy; its last
 * entry is the address the proxy saw. Without a proxy (local dev) every client shares one key.
 */
export function clientIp(c: Context): string {
	return c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() || 'local'
}
