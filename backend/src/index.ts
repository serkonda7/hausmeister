import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { BACKEND_HOST, BACKEND_PORT } from './constants'
import { initDb } from './db'
import { authApp } from './routes/auth'
import { bookApp } from './routes/books'
import { authorApp, languageApp, publisherApp, tagApp } from './routes/catalog'
import { loanApp } from './routes/loans'
import { locationApp } from './routes/locations'
import { provenanceApp } from './routes/provenance'
import { readingApp } from './routes/reading'
import { userApp } from './routes/users'
import { type AppEnv, requireAuth } from './util/auth'
import { jsonError } from './util/http'

export function createApp() {
	return (
		new Hono<AppEnv>()
			.onError((err, c) => {
				if (err instanceof HTTPException) return jsonError(c, err.message, err.status)
				console.error(err)
				return jsonError(c, 'Internal server error', 500)
			})
			.get('/api/health', (c) => c.json({ ok: true }))
			.route('/api/auth', authApp)
			// Everything below requires a session.
			.use('/api/*', requireAuth)
			.route('/api/users', userApp)
			.route('/api/books', bookApp)
			.route('/api/authors', authorApp)
			.route('/api/locations', locationApp)
			.route('/api/languages', languageApp)
			.route('/api/publishers', publisherApp)
			.route('/api/tags', tagApp)
			.route('/api', readingApp)
			.route('/api', loanApp)
			.route('/api', provenanceApp)
	)
}

if (import.meta.main) {
	initDb()
	const server = Bun.serve({
		hostname: BACKEND_HOST,
		port: BACKEND_PORT,
		fetch: createApp().fetch,
	})
	console.log(`API running on ${server.url}`)
}
