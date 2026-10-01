import { vValidator } from '@hono/valibot-validator'
import { and, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateUserSchema, UpdateUserSchema } from 'shared/src/book'
import { getDb } from '../db'
import { sessions, users } from '../schema'
import {
	type AppEnv,
	assertUsernameFree,
	bearerToken,
	currentUser,
	insertUser,
	isLastAdmin,
	requireAdmin,
	toPublicUser,
} from '../util/auth'
import { fail } from '../util/http'

function requireUser(id: string) {
	return getDb().select().from(users).where(eq(users.id, id)).get() ?? fail(404, 'Not found')
}

export const userApp = new Hono<AppEnv>()
	.use(requireAdmin)
	.get('/', (c) => {
		const rows = getDb().select().from(users).all().map(toPublicUser)
		rows.sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
		return c.json({ users: rows })
	})
	.post('/', vValidator('json', CreateUserSchema), async (c) => {
		return c.json({ user: await insertUser(getDb(), c.req.valid('json')) }, 201)
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		if (currentUser(c).id === id) fail(400, 'You cannot delete your own account')
		const existing = requireUser(id)
		if (existing.isAdmin === 1 && isLastAdmin(db)) fail(400, 'Cannot delete the last admin')
		db.delete(users).where(eq(users.id, id)).run()
		return c.json({ ok: true })
	})
	.patch('/:id', vValidator('json', UpdateUserSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const data = c.req.valid('json')
		if (Object.values(data).every((value) => value === undefined)) fail(400, 'Nothing to update')
		const existing = requireUser(id)
		if (data.username !== undefined) assertUsernameFree(db, data.username, id)
		if (existing.isAdmin === 1 && data.isAdmin === false && isLastAdmin(db)) {
			fail(400, 'Cannot demote the last admin')
		}
		db.update(users)
			.set({
				username: data.username,
				displayName: data.displayName,
				passwordHash: data.password && (await Bun.password.hash(data.password)),
				isAdmin: data.isAdmin === undefined ? undefined : Number(data.isAdmin),
			})
			.where(eq(users.id, id))
			.run()
		if (data.password !== undefined) {
			// Force re-login everywhere except the session that made the change (admin editing self).
			const keep = ne(sessions.token, bearerToken(c) ?? '')
			db.delete(sessions)
				.where(and(eq(sessions.userId, id), keep))
				.run()
		}
		return c.json({ user: toPublicUser(requireUser(id)) })
	})
