import { vValidator } from '@hono/valibot-validator'
import { and, eq, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { CreateUserSchema, UpdateUserSchema } from 'shared/src/book'
import { getDb } from '../db'
import { bookReads, sessions, users } from '../schema'
import { authMiddleware, getAuthUser, toPublicUser } from '../util/auth'
import { jsonError } from '../util/http'

function tokenFromHeader(c: {
	req: { header: (name: string) => string | undefined }
}): string | null {
	const header = c.req.header('authorization') ?? ''
	const match = /^Bearer (.+)$/.exec(header.trim())
	return match ? match[1].trim() : null
}

export const userApp = new Hono()
	.use('*', authMiddleware)
	.get('/', (c) => {
		const me = getAuthUser(c)
		if (!me?.isAdmin) {
			return jsonError(c, 'Forbidden', 403)
		}
		const db = getDb()
		const rows = db.select().from(users).all()
		rows.sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
		return c.json({ users: rows.map(toPublicUser) })
	})
	.post('/', vValidator('json', CreateUserSchema), async (c) => {
		const me = getAuthUser(c)
		if (!me?.isAdmin) {
			return jsonError(c, 'Forbidden', 403)
		}
		const db = getDb()
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
				isAdmin: data.isAdmin ? 1 : 0,
				createdAt: now,
			})
			.run()
		const [row] = db.select().from(users).where(eq(users.id, id)).all()
		return c.json({ user: toPublicUser(row) }, 201)
	})
	.delete('/:id', (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const me = getAuthUser(c)
		if (!me?.isAdmin) {
			return jsonError(c, 'Forbidden', 403)
		}
		if (me && me.id === id) {
			return jsonError(c, 'You cannot delete your own account', 400)
		}
		const [existing] = db.select().from(users).where(eq(users.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		if (existing.isAdmin === 1) {
			const admins = db.select().from(users).where(eq(users.isAdmin, 1)).all()
			if (admins.length <= 1) {
				return jsonError(c, 'Cannot delete the last admin', 400)
			}
		}
		db.delete(sessions).where(eq(sessions.userId, id)).run()
		db.delete(bookReads).where(eq(bookReads.userId, id)).run()
		db.delete(users).where(eq(users.id, id)).run()
		return c.json({ ok: true })
	})
	.patch('/:id', vValidator('json', UpdateUserSchema), async (c) => {
		const db = getDb()
		const id = c.req.param('id')
		const me = getAuthUser(c)
		if (!me?.isAdmin) {
			return jsonError(c, 'Forbidden', 403)
		}
		const data = c.req.valid('json')
		if (
			data.username === undefined &&
			data.displayName === undefined &&
			data.password === undefined &&
			data.isAdmin === undefined
		) {
			return jsonError(c, 'Nothing to update', 400)
		}
		const [existing] = db.select().from(users).where(eq(users.id, id)).all()
		if (!existing) {
			return jsonError(c, 'Not found', 404)
		}
		const updates: {
			username?: string
			displayName?: string | null
			passwordHash?: string
			isAdmin?: number
		} = {}
		if (data.username !== undefined) {
			const username = data.username.trim()
			const [conflict] = db
				.select()
				.from(users)
				.where(and(sql`lower(${users.username}) = lower(${username})`, ne(users.id, id)))
				.all()
			if (conflict) {
				return jsonError(c, 'Username already taken', 409)
			}
			updates.username = username
		}
		if (data.displayName !== undefined) {
			updates.displayName = data.displayName
		}
		if (data.password !== undefined) {
			updates.passwordHash = await Bun.password.hash(data.password)
		}
		if (data.isAdmin !== undefined) {
			if (existing.isAdmin === 1 && !data.isAdmin) {
				const admins = db.select().from(users).where(eq(users.isAdmin, 1)).all()
				if (admins.length <= 1) {
					return jsonError(c, 'Cannot demote the last admin', 400)
				}
			}
			updates.isAdmin = data.isAdmin ? 1 : 0
		}
		db.update(users).set(updates).where(eq(users.id, id)).run()
		if (data.password !== undefined) {
			// Force re-login everywhere except the session that made the change (admin editing self).
			const currentToken = tokenFromHeader(c)
			if (currentToken) {
				db.delete(sessions)
					.where(and(eq(sessions.userId, id), ne(sessions.token, currentToken)))
					.run()
			} else {
				db.delete(sessions).where(eq(sessions.userId, id)).run()
			}
		}
		const [row] = db.select().from(users).where(eq(users.id, id)).all()
		return c.json({ user: toPublicUser(row) })
	})
