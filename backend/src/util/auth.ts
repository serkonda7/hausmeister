import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import type { CreateUser, PublicUser } from 'shared/src/book'
import { type Db, getDb } from '../db'
import { sessions, users } from '../schema'
import { fail } from './http'
import { ieq } from './query'

export type AppEnv = { Variables: { user?: PublicUser } }

export function toPublicUser(row: typeof users.$inferSelect): PublicUser {
	return {
		id: row.id,
		username: row.username,
		displayName: row.displayName,
		isAdmin: row.isAdmin === 1,
		createdAt: row.createdAt,
	}
}

export function bearerToken(c: { req: { header: (name: string) => string | undefined } }) {
	const match = /^Bearer (.+)$/.exec(c.req.header('authorization')?.trim() ?? '')
	return match ? match[1].trim() : null
}

function userForToken(token: string | null): PublicUser | null {
	if (!token) return null
	const row = getDb()
		.select({ user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.token, token))
		.get()
	return row ? toPublicUser(row.user) : null
}

/** Sets the session user when a valid token is sent; never rejects the request. */
export const optionalAuth = createMiddleware<AppEnv>(async (c, next) => {
	const user = userForToken(bearerToken(c))
	if (user) c.set('user', user)
	await next()
})

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	c.set('user', userForToken(bearerToken(c)) ?? fail(401, 'Unauthorized'))
	await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
	if (!currentUser(c).isAdmin) fail(403, 'Forbidden')
	await next()
})

export function currentUser(c: { var: AppEnv['Variables'] }): PublicUser {
	return c.var.user ?? fail(401, 'Unauthorized')
}

export function createSession(db: Db, userId: string): string {
	const token = crypto.randomUUID()
	db.insert(sessions).values({ token, userId, createdAt: Date.now() }).run()
	return token
}

export function findUserByName(db: Db, username: string) {
	return db.select().from(users).where(ieq(users.username, username)).get()
}

export function assertUsernameFree(db: Db, username: string, ownId?: string): void {
	const existing = findUserByName(db, username)
	if (existing && existing.id !== ownId) fail(409, 'Username already taken')
}

export function hasUsers(db: Db): boolean {
	return db.select({ id: users.id }).from(users).limit(1).get() !== undefined
}

export function isLastAdmin(db: Db): boolean {
	return db.select({ id: users.id }).from(users).where(eq(users.isAdmin, 1)).all().length <= 1
}

export async function insertUser(db: Db, data: CreateUser): Promise<PublicUser> {
	assertUsernameFree(db, data.username)
	const row = {
		id: crypto.randomUUID(),
		username: data.username,
		displayName: data.displayName ?? null,
		passwordHash: await Bun.password.hash(data.password),
		isAdmin: data.isAdmin ? 1 : 0,
		createdAt: Date.now(),
	}
	db.insert(users).values(row).run()
	return toPublicUser(row)
}
