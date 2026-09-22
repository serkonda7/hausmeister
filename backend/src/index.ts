import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { BACKEND_HOST, BACKEND_PORT } from './constants'
import { initDb } from './db'
import { authApp } from './routes/auth'
import { authorApp } from './routes/authors'
import { bookApp } from './routes/books'
import { languageApp } from './routes/languages'
import { loanApp } from './routes/loans'
import { locationApp } from './routes/locations'
import { provenanceApp } from './routes/provenance'
import { publisherApp } from './routes/publishers'
import { readingApp } from './routes/reading'
import { tagApp } from './routes/tags'
import { userApp } from './routes/users'
import { jsonError } from './util/http'

export function createApp(): Hono {
	return new Hono()
		.onError((err, c) => {
			if (err instanceof HTTPException) {
				return jsonError(c, err.message, err.status)
			}
			console.error(err)
			return jsonError(c, 'Internal server error', 500)
		})
		.get('/api/health', (c) => c.json({ ok: true }))
		.route('/api/auth', authApp)
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
}

export type AppType = ReturnType<typeof createApp>

if (import.meta.main) {
	initDb()
	const app = createApp()
	const server = Bun.serve({
		hostname: BACKEND_HOST,
		port: BACKEND_PORT,
		fetch: app.fetch,
	})
	console.log(`API running on ${server.url}`)
}
