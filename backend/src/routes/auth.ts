import { vValidator } from '@hono/valibot-validator'
import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { LoginSchema, SetupAdminSchema } from 'shared/src/book'
import { getDb } from '../db'
import { sessions, users } from '../schema'
import { getAuthUser, optionalAuthMiddleware, toPublicUser } from '../util/auth'
import { jsonError } from '../util/http'

export const authApp = new Hono()
	.get('/status', optionalAuthMiddleware, (c) => {
		const db = getDb()
		const rows = db.select({ id: users.id }).from(users).all()
		const user = getAuthUser(c)
		return c.json({ setupRequired: rows.length === 0, user: user ?? null })
	})
	.post('/setup', vValidator('json', SetupAdminSchema), async (c) => {
		const db = getDb()
		const existing = db.select({ id: users.id }).from(users).all()
		if (existing.length > 0) {
			return jsonError(c, 'Setup already completed', 409)
		}
		const data = c.req.valid('json')
		const username = data.username.trim()
		const [conflict] = db
			.select()
			.from(users)
			.where(sql`lower(${users.username}) = lower(${username})`)
			.all()
		if (conflict) {
			return jsonError(c, 'Username already taken', 409)
		}
		const id = crypto.randomUUID()
		const passwordHash = await Bun.password.hash(data.password)
		const now = Date.now()
		db.insert(users)
			.values({
				id,
				username,
				displayName: data.displayName ?? null,
				passwordHash,
				isAdmin: 1,
				createdAt: now,
			})
			.run()
		const token = crypto.randomUUID()
		db.insert(sessions).values({ token, userId: id, createdAt: now }).run()
		const [row] = db.select().from(users).where(eq(users.id, id)).all()
		return c.json({ user: toPublicUser(row), token }, 201)
	})
	.post('/login', vValidator('json', LoginSchema), async (c) => {
		const db = getDb()
		const data = c.req.valid('json')
		const username = data.username.trim()
		const [row] = db
			.select()
			.from(users)
			.where(sql`lower(${users.username}) = lower(${username})`)
			.all()
		if (!row) {
			return jsonError(c, 'Invalid username or password', 401)
		}
		const ok = await Bun.password.verify(data.password, row.passwordHash)
		if (!ok) {
			return jsonError(c, 'Invalid username or password', 401)
		}
		const token = crypto.randomUUID()
		db.insert(sessions).values({ token, userId: row.id, createdAt: Date.now() }).run()
		return c.json({ user: toPublicUser(row), token })
	})
	.post('/logout', optionalAuthMiddleware, (c) => {
		const header = c.req.header('authorization') ?? ''
		const match = /^Bearer (.+)$/.exec(header.trim())
		if (match) {
			const db = getDb()
			db.delete(sessions).where(eq(sessions.token, match[1].trim())).run()
		}
		return c.json({ ok: true })
	})
	.get('/me', optionalAuthMiddleware, (c) => {
		const user = getAuthUser(c)
		if (!user) {
			return jsonError(c, 'Unauthorized', 401)
		}
		return c.json({ user })
	})
