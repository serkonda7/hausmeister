import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { LoginSchema, SetupAdminSchema } from 'shared/src/book'
import { getDb } from '../db'
import { sessions } from '../schema'
import {
	type AppEnv,
	bearerToken,
	createSession,
	findUserByName,
	hasUsers,
	insertUser,
	optionalAuth,
	toPublicUser,
} from '../util/auth'
import { fail } from '../util/http'

export const authApp = new Hono<AppEnv>()
	.get('/status', optionalAuth, (c) => {
		return c.json({ setupRequired: !hasUsers(getDb()), user: c.var.user ?? null })
	})
	.post('/setup', vValidator('json', SetupAdminSchema), async (c) => {
		const db = getDb()
		if (hasUsers(db)) fail(409, 'Setup already completed')
		const user = await insertUser(db, { ...c.req.valid('json'), isAdmin: true })
		return c.json({ user, token: createSession(db, user.id) }, 201)
	})
	.post('/login', vValidator('json', LoginSchema), async (c) => {
		const db = getDb()
		const { username, password } = c.req.valid('json')
		const row = findUserByName(db, username)
		if (!row || !(await Bun.password.verify(password, row.passwordHash))) {
			fail(401, 'Invalid username or password')
		}
		return c.json({ user: toPublicUser(row), token: createSession(db, row.id) })
	})
	.post('/logout', (c) => {
		const token = bearerToken(c)
		if (token) getDb().delete(sessions).where(eq(sessions.token, token)).run()
		return c.json({ ok: true })
	})
