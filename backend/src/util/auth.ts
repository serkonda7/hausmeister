import { eq } from 'drizzle-orm'
import type { Context, Next } from 'hono'
import { getDb } from '../db'
import { sessions, users } from '../schema'
import { jsonError } from './http'

export type AuthUser = {
	id: string
	username: string
	displayName: string | null
	isAdmin: boolean
	createdAt: number
}

export function toPublicUser(row: typeof users.$inferSelect): AuthUser {
	return {
		id: row.id,
		username: row.username,
		displayName: row.displayName ?? null,
		isAdmin: row.isAdmin === 1,
		createdAt: row.createdAt,
	}
}

function tokenFromHeader(c: Context): string | null {
	const header = c.req.header('authorization') ?? ''
	const match = /^Bearer (.+)$/.exec(header.trim())
	return match ? match[1].trim() : null
}

export function getAuthUser(c: Context): AuthUser | null {
	return (c.get('user') as AuthUser | undefined) ?? null
}

export async function authMiddleware(c: Context, next: Next): Promise<Response | undefined> {
	const token = tokenFromHeader(c)
	if (!token) {
		return jsonError(c, 'Unauthorized', 401)
	}
	const db = getDb()
	const [session] = db.select().from(sessions).where(eq(sessions.token, token)).all()
	if (!session) {
		return jsonError(c, 'Unauthorized', 401)
	}
	const [row] = db.select().from(users).where(eq(users.id, session.userId)).all()
	if (!row) {
		return jsonError(c, 'Unauthorized', 401)
	}
	c.set('user', toPublicUser(row))
	await next()
}

export async function optionalAuthMiddleware(c: Context, next: Next): Promise<void> {
	const token = tokenFromHeader(c)
	if (token) {
		try {
			const db = getDb()
			const [session] = db.select().from(sessions).where(eq(sessions.token, token)).all()
			if (session) {
				const [row] = db.select().from(users).where(eq(users.id, session.userId)).all()
				if (row) {
					c.set('user', toPublicUser(row))
				}
			}
		} catch {
			// Treat auth lookup failures as anonymous.
		}
	}
	await next()
}

export async function requireAdminMiddleware(
	c: Context,
	next: Next,
): Promise<Response | undefined> {
	const user = getAuthUser(c)
	if (!user) {
		return jsonError(c, 'Unauthorized', 401)
	}
	if (!user.isAdmin) {
		return jsonError(c, 'Forbidden', 403)
	}
	await next()
}

export type OwnableBook = { ownerId: string | null }

export function canEditBook(book: OwnableBook, user: AuthUser): boolean {
	if (user.isAdmin) {
		return true
	}
	return book.ownerId !== null && book.ownerId === user.id
}

export function countUsers(): number {
	const db = getDb()
	const rows = db.select({ id: users.id }).from(users).all()
	return rows.length
}
