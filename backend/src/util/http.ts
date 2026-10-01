import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

export function jsonError(c: Context, message: string, status: ContentfulStatusCode): Response {
	return c.json({ error: message }, status)
}

/** Abort the request; `createApp`'s error handler turns this into `{ error }` JSON. */
export function fail(status: ContentfulStatusCode, message: string): never {
	throw new HTTPException(status, { message })
}
