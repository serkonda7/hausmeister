import { vValidator } from '@hono/valibot-validator'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { ChangePasswordSchema, LoginSchema, SetupAdminSchema } from 'shared/src/book'
import { getDb } from '../db'
import { users } from '../schema'
import {
	type AppEnv,
	bearerToken,
	createSession,
	currentUser,
	deleteOtherSessions,
	deleteSession,
	findUserByName,
	hasUsers,
	insertUser,
	optionalAuth,
	requireAuth,
	toPublicUser,
	verifyPassword,
} from '../util/auth'
import { fail } from '../util/http'
import { clientIp, createRateLimiter } from '../util/rate-limit'

/** Password checks per client address and per account: 3 per 15 minutes. */
const passwordAttempts = createRateLimiter(3, 15 * 60 * 1000)

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
		const keys = [`ip:${clientIp(c)}`, `user:${username.toLowerCase()}`]
		passwordAttempts.consume(c, keys)
		const row = findUserByName(db, username)
		if (!(await verifyPassword(password, row)) || !row) fail(401, 'Invalid username or password')
		passwordAttempts.reset(keys)
		return c.json({ user: toPublicUser(row), token: createSession(db, row.id) })
	})
	.post('/logout', (c) => {
		const token = bearerToken(c)
		if (token) deleteSession(getDb(), token)
		return c.json({ ok: true })
	})
	// Own password change; ends every other session of the user.
	.post('/password', requireAuth, vValidator('json', ChangePasswordSchema), async (c) => {
		const db = getDb()
		const me = currentUser(c)
		const { currentPassword, newPassword } = c.req.valid('json')
		const keys = [`ip:${clientIp(c)}`, `user:${me.username.toLowerCase()}`]
		passwordAttempts.consume(c, keys)
		const row = db.select().from(users).where(eq(users.id, me.id)).get()
		// 403, not 401: the session is still valid.
		if (!(await verifyPassword(currentPassword, row))) fail(403, 'Current password is wrong')
		passwordAttempts.reset(keys)
		db.update(users)
			.set({ passwordHash: await Bun.password.hash(newPassword) })
			.where(eq(users.id, me.id))
			.run()
		deleteOtherSessions(db, me.id, bearerToken(c))
		return c.json({ ok: true })
	})
