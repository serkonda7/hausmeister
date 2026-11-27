// The error thrown by the items, locations, tags, search and history services.
// Its message is "CODE" or "CODE:detail" (codes and German text:
// src/lib/items/errors.ts). Invisible items answer exactly like missing ones:
// ITEM_NOT_FOUND (404), never ITEM_FORBIDDEN (DESIGN §11).
import type { z } from 'zod'
import type { ItemsErrorCode } from '../../lib/items/errors'
import { HttpError } from '../auth/context'

export class ItemsError extends HttpError {
	constructor(
		status: 403 | 404 | 409 | 422,
		public readonly code: ItemsErrorCode,
		public readonly detail?: string,
	) {
		super(status, detail ? `${code}:${detail}` : code)
		this.name = 'ItemsError'
	}
}

export const notFound = () => new ItemsError(404, 'ITEM_NOT_FOUND')
export const forbidden = () => new ItemsError(403, 'ITEM_FORBIDDEN')
export const conflict = () => new ItemsError(409, 'VERSION_CONFLICT')

/** Parses service input; a failure is INVALID_INPUT with the first issue as detail. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
	const r = schema.safeParse(input)
	if (!r.success) {
		const issue = r.error.issues[0]
		const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
		throw new ItemsError(422, 'INVALID_INPUT', `${where}${issue?.message ?? 'invalid'}`)
	}
	return r.data
}
