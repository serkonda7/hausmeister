import type { Context } from 'hono'

export function jsonError(c: Context, message: string, status = 400): Response {
	return c.json({ error: message }, status as 400)
}
