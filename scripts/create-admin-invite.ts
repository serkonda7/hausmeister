// Prints a one-time invite link (default: admin, valid 24 h). For the first
// admin on a fresh instance and for recovery when no admin can sign in.
//
//   bun run create-admin-invite                       # local: ./data/db/app.sqlite
//   docker compose exec app bun run create-admin-invite   # production container
//   options: --role admin|member|guest  --hours N  --force (when active admins exist)
//
// Standalone on purpose: the production image has no src/ and no drizzle-orm,
// only bun. It writes the same rows as src/server/auth/invites.ts (token is
// only stored as its SHA-256; an `invite.created` event with actor NULL).
// The app must have started once so that migrations created the tables.
import { Database } from 'bun:sqlite'
import { existsSync } from 'node:fs'

const ROLES = ['admin', 'member', 'guest'] as const
type Role = (typeof ROLES)[number]

export function createInviteRow(
	db: Database,
	opts: { role: Role; hours: number; now?: number },
): { token: string; expiresAt: Date } {
	const now = opts.now ?? Date.now()
	const token = crypto
		.getRandomValues(new Uint8Array(32))
		.toBase64({ alphabet: 'base64url', omitPadding: true })
	const tokenHash = Bun.CryptoHasher.hash('sha256', token, 'hex')
	const id = Bun.randomUUIDv7()
	const expiresAt = now + opts.hours * 60 * 60 * 1000
	db.transaction(() => {
		db.query(
			'INSERT INTO invites (id, role, token_hash, expires_at, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
		).run(id, opts.role, tokenHash, expiresAt, now)
		db.query(
			"INSERT INTO events (id, item_id, actor_id, action, diff, at) VALUES (?, NULL, NULL, 'invite.created', ?, ?)",
		).run(
			Bun.randomUUIDv7(),
			JSON.stringify({
				inviteId: id,
				role: opts.role,
				expiresAt: new Date(expiresAt).toISOString(),
				via: 'cli',
			}),
			now,
		)
	})()
	return { token, expiresAt: new Date(expiresAt) }
}

export function activeAdminCount(db: Database): number {
	const row = db
		.query("SELECT count(*) AS n FROM users WHERE role = 'admin' AND disabled_at IS NULL")
		.get() as { n: number }
	return row.n
}

function fail(msg: string, code = 1): never {
	console.error(`create-admin-invite: ${msg}`)
	process.exit(code)
}

function main(argv: string[]) {
	let role: Role = 'admin'
	let hours = 24
	let force = false
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--force') force = true
		else if (a === '--role') {
			const v = argv[++i] as Role
			if (!ROLES.includes(v)) fail(`--role must be one of ${ROLES.join(', ')}`)
			role = v
		} else if (a === '--hours') {
			hours = Number(argv[++i])
			if (!Number.isInteger(hours) || hours < 1 || hours > 720) fail('--hours must be 1..720')
		} else fail(`unknown argument ${a}`)
	}

	const path = process.env.DATABASE_PATH || './data/db/app.sqlite'
	const origin = new URL(process.env.ORIGIN || 'http://localhost:3000').origin
	if (!existsSync(path)) fail(`database ${path} not found. Start the app once first.`)
	const db = new Database(path, { strict: true })
	db.exec('PRAGMA busy_timeout = 5000')
	const hasTable = db
		.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'invites'")
		.get()
	if (!hasTable) fail('tables missing. Start the app once so migrations run.')
	const admins = activeAdminCount(db)
	if (admins > 0 && !force) {
		fail(
			`${admins} active admin(s) exist. Invite people from the app (Verwaltung → Einladungen), or pass --force for recovery.`,
			2,
		)
	}
	const { token, expiresAt } = createInviteRow(db, { role, hours })
	db.close()
	console.log(`Invite (${role}), valid until ${expiresAt.toISOString()}, usable once:`)
	console.log(`${origin}/invite/${token}`)
}

if (import.meta.main) main(process.argv.slice(2))
