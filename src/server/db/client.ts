import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { getEnv } from '../env'
import * as schema from './schema'

export type AppDb = BunSQLiteDatabase<typeof schema> & { $client: Database }
/** The `tx` handed to `db.transaction((tx) => …)`. */
export type AppTx = Parameters<Parameters<AppDb['transaction']>[0]>[0]
/** Functions that work both standalone and inside a caller's transaction take this. */
export type DbOrTx = AppDb | AppTx

/**
 * Where the generated SQL migrations live. In the repo and in the Docker image
 * (WORKDIR /app) that is ./drizzle relative to the working directory.
 */
export function migrationsDir(): string {
	if (process.env.MIGRATIONS_DIR) return resolve(process.env.MIGRATIONS_DIR)
	const fromCwd = resolve(process.cwd(), 'drizzle')
	if (existsSync(join(fromCwd, 'meta', '_journal.json'))) return fromCwd
	// Fallback when run from another cwd: the repo root next to src/.
	return resolve(import.meta.dir, '../../../drizzle')
}

/**
 * Opens a SQLite database with the app's pragmas and applies all pending
 * migrations. `path` may be ":memory:".
 */
export function openDatabase(path: string, opts: { snapshotBeforeMigrate?: boolean } = {}): AppDb {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
	const sqlite = new Database(path, { create: true, strict: true })
	sqlite.exec('PRAGMA journal_mode = WAL')
	sqlite.exec('PRAGMA foreign_keys = ON')
	sqlite.exec('PRAGMA busy_timeout = 5000')
	sqlite.exec('PRAGMA synchronous = NORMAL')
	const db = drizzle({ client: sqlite, schema }) as AppDb

	const folder = migrationsDir()
	if (opts.snapshotBeforeMigrate && path !== ':memory:') snapshotIfPending(sqlite, path, folder)
	migrate(db, { migrationsFolder: folder })
	return db
}

/** How many pre-migration snapshots `snapshotIfPending` keeps per database. */
export const KEEP_SNAPSHOTS = 3

/**
 * DESIGN §8.6: take a DB snapshot before migrations run on an existing
 * database, as `<db>.pre-migrate-<ISO time>.bak` next to it. Only the newest
 * KEEP_SNAPSHOTS are kept. Litestream replicates only the configured path
 * (deploy/litestream.yml), so these files are local only and never restored.
 */
function snapshotIfPending(sqlite: Database, path: string, folder: string) {
	const journal = JSON.parse(readFileSync(join(folder, 'meta', '_journal.json'), 'utf8')) as {
		entries: unknown[]
	}
	const hasTable = sqlite
		.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
		.get()
	const hasData = sqlite.query("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").get()
	if (!hasData) return // fresh database, nothing to protect
	const applied = hasTable
		? (sqlite.query('SELECT count(*) AS n FROM __drizzle_migrations').get() as { n: number }).n
		: 0
	if (applied >= journal.entries.length) return
	const target = `${path}.pre-migrate-${new Date().toISOString().replace(/[:.]/g, '-')}.bak`
	sqlite.query('VACUUM INTO ?').run(target)
	console.log(`[db] snapshot before migrations: ${target}`)
	for (const old of pruneSnapshots(path, KEEP_SNAPSHOTS)) {
		console.log(`[db] removed old snapshot: ${old}`)
	}
}

/**
 * Deletes all but the newest `keep` pre-migration snapshots of `path`
 * (the ISO timestamp in the name sorts chronologically). Returns the removed paths.
 */
export function pruneSnapshots(path: string, keep: number): string[] {
	const dir = dirname(path)
	const prefix = `${basename(path)}.pre-migrate-`
	const snaps = readdirSync(dir)
		.filter((f) => f.startsWith(prefix) && f.endsWith('.bak'))
		.sort()
		.reverse()
	const removed: string[] = []
	for (const f of snaps.slice(keep)) {
		rmSync(join(dir, f), { force: true })
		removed.push(join(dir, f))
	}
	return removed
}

// On globalThis: the Nitro startup plugin and the lazily loaded app bundle may
// each carry their own copy of this module, and both must share one connection
// (so shutdown can close it).
const G = globalThis as unknown as { __hausmeisterDb?: AppDb }

/**
 * The process-wide database (DATABASE_PATH). The first call opens it, runs
 * migrations and records a row in `boots`.
 */
export function getDb(): AppDb {
	if (G.__hausmeisterDb) return G.__hausmeisterDb
	const db = openDatabase(getEnv().DATABASE_PATH, { snapshotBeforeMigrate: true })
	db.insert(schema.boots).values({ at: new Date().toISOString() }).run()
	G.__hausmeisterDb = db
	return db
}

/**
 * Closes the process-wide database at shutdown. A PASSIVE checkpoint first
 * moves committed WAL frames into the main file without waiting for readers
 * or resetting the WAL, so a running Litestream (which holds its own read
 * connection and manages the WAL itself) is never disturbed.
 */
export function closeDb(): boolean {
	const db = G.__hausmeisterDb
	if (!db) return false
	G.__hausmeisterDb = undefined
	closeDatabase(db)
	return true
}

/**
 * Checkpoints (PASSIVE) and closes one connection. `close(true)` finalizes
 * cached statements and closes now; plain `close()` would defer the close
 * (and SQLite's final checkpoint) while any cached `query()` statement lives.
 */
export function closeDatabase(db: AppDb) {
	try {
		db.$client.exec('PRAGMA wal_checkpoint(PASSIVE)')
	} finally {
		try {
			db.$client.close(true)
		} catch {
			db.$client.close() // a statement is still running: close when it ends
		}
	}
}
