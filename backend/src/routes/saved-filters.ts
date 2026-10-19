import { vValidator } from '@hono/valibot-validator'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { SavedFilterScopeSchema, SavedFiltersSchema } from 'shared/src/book'
import * as v from 'valibot'
import { getDb } from '../db'
import { savedFilters } from '../schema'
import { type AppEnv, currentUser } from '../util/auth'

const ScopeParamSchema = v.object({ scope: SavedFilterScopeSchema })

function listSavedFilters(userId: string, scope: string) {
	return getDb()
		.select({ name: savedFilters.name, values: savedFilters.values })
		.from(savedFilters)
		.where(and(eq(savedFilters.userId, userId), eq(savedFilters.scope, scope)))
		.orderBy(asc(savedFilters.position))
		.all()
}

// Saved filters are personal: each user only ever sees and replaces their own.
export const savedFilterApp = new Hono<AppEnv>()
	.get('/:scope', vValidator('param', ScopeParamSchema), (c) => {
		const { scope } = c.req.valid('param')
		return c.json({ savedFilters: listSavedFilters(currentUser(c).id, scope) })
	})
	.put(
		'/:scope',
		vValidator('param', ScopeParamSchema),
		vValidator('json', SavedFiltersSchema),
		(c) => {
			const { scope } = c.req.valid('param')
			const userId = currentUser(c).id
			const list = c.req.valid('json').savedFilters
			getDb().transaction((tx) => {
				tx.delete(savedFilters)
					.where(and(eq(savedFilters.userId, userId), eq(savedFilters.scope, scope)))
					.run()
				if (list.length > 0) {
					tx.insert(savedFilters)
						.values(list.map((f, position) => ({ userId, scope, position, ...f })))
						.run()
				}
			})
			return c.json({ savedFilters: listSavedFilters(userId, scope) })
		},
	)
