import { and, eq, lt, ne, or } from 'drizzle-orm'
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

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Sessions end this long after login, however active they are. */
const SESSION_MAX_AGE = 30 * DAY
/** Sessions end after this long without a request. */
const SESSION_IDLE_TIMEOUT = 7 * DAY
/** `lastUsedAt` is only written when older than this, to avoid a write per request. */
const SESSION_TOUCH_INTERVAL = HOUR

/** Sessions store only this hash, so a leaked database holds no usable tokens. */
function hashToken(token: string): string {
	return new Bun.CryptoHasher('sha256').update(token).digest('hex')
}

function isExpired(session: typeof sessions.$inferSelect, now: number): boolean {
	return session.expiresAt <= now || session.lastUsedAt + SESSION_IDLE_TIMEOUT <= now
}

function userForToken(token: string | null): PublicUser | null {
	if (!token) return null
	const db = getDb()
	const tokenHash = hashToken(token)
	const row = db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.tokenHash, tokenHash))
		.get()
	if (!row) return null
	const now = Date.now()
	if (isExpired(row.session, now)) {
		db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run()
		return null
	}
	if (now - row.session.lastUsedAt > SESSION_TOUCH_INTERVAL) {
		db.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.tokenHash, tokenHash)).run()
	}
	return toPublicUser(row.user)
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

/** Start a session and return its bearer token; also clears out expired sessions. */
export function createSession(db: Db, userId: string): string {
	const now = Date.now()
	db.delete(sessions)
		.where(or(lt(sessions.expiresAt, now), lt(sessions.lastUsedAt, now - SESSION_IDLE_TIMEOUT)))
		.run()
	const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
	db.insert(sessions)
		.values({
			tokenHash: hashToken(token),
			userId,
			createdAt: now,
			lastUsedAt: now,
			expiresAt: now + SESSION_MAX_AGE,
		})
		.run()
	return token
}

export function deleteSession(db: Db, token: string): void {
	db.delete(sessions)
		.where(eq(sessions.tokenHash, hashToken(token)))
		.run()
}

/** End all of a user's sessions, except the one using `keepToken` (if given). */
export function deleteOtherSessions(db: Db, userId: string, keepToken: string | null): void {
	const keep = keepToken ? ne(sessions.tokenHash, hashToken(keepToken)) : undefined
	db.delete(sessions)
		.where(and(eq(sessions.userId, userId), keep))
		.run()
}

let dummyHash: Promise<string> | undefined

/**
 * Check `password` against a user's hash. Unknown users are checked against a dummy hash so
 * the response time doesn't reveal which usernames exist.
 */
export async function verifyPassword(
	password: string,
	user: typeof users.$inferSelect | undefined,
): Promise<boolean> {
	dummyHash ??= Bun.password.hash(crypto.randomUUID())
	const ok = await Bun.password.verify(password, user?.passwordHash ?? (await dummyHash))
	return ok && user !== undefined
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
