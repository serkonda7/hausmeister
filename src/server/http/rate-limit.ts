// Small in-memory fixed-window limiter (one process, one household: no Redis).
// Used for invite lookups/accepts; Better Auth has its own limiter for /api/auth.
export type RateLimiter = {
	/** Counts one hit for `key`; false when the key is over its limit. */
	hit(key: string, now?: number): boolean
	reset(): void
}

export function createRateLimiter(opts: {
	windowMs: number
	max: number
	maxKeys?: number
}): RateLimiter {
	const buckets = new Map<string, { start: number; count: number }>()
	const maxKeys = opts.maxKeys ?? 10_000
	return {
		hit(key, now = Date.now()) {
			let b = buckets.get(key)
			if (!b || now - b.start >= opts.windowMs) {
				if (!b && buckets.size >= maxKeys) prune(buckets, now, opts.windowMs, maxKeys)
				b = { start: now, count: 0 }
				buckets.set(key, b)
			}
			b.count++
			return b.count <= opts.max
		},
		reset() {
			buckets.clear()
		},
	}
}

function prune(
	buckets: Map<string, { start: number }>,
	now: number,
	windowMs: number,
	maxKeys: number,
) {
	for (const [k, b] of buckets) if (now - b.start >= windowMs) buckets.delete(k)
	// Still full: drop the oldest entries (Map keeps insertion order).
	for (const k of buckets.keys()) {
		if (buckets.size < maxKeys) break
		buckets.delete(k)
	}
}

/**
 * Client IP for throttling. Caddy is the only client of the app in production
 * and sets X-Forwarded-For (DESIGN §8.2), like Better Auth's config assumes.
 */
export function clientIp(headers: Headers): string {
	return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
