// Upgrade path for databases created before drizzle migrations were introduced.
// Rebuilds such a database with the baseline migration (0000_init) and records
// it as applied. Do not add new schema changes here; generate a migration with
// `bun run db:generate` instead.
import type { Database } from 'bun:sqlite'
import type { MigrationMeta } from 'drizzle-orm/migrator'
import { PAGE_NOTE_LIMITS, type PageNote } from 'shared/src/book'

/** Pre-migration table creation. Idempotent via IF NOT EXISTS. */
function createCoreTables(sqlite: Database): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS books (
			id TEXT PRIMARY KEY,
			isbn TEXT,
			title TEXT NOT NULL,
			subtitle TEXT,
			publisher_id TEXT REFERENCES publishers(id) ON DELETE SET NULL,
			owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
			location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
			print_year INTEGER,
			languages TEXT NOT NULL DEFAULT '[]',
			cover_url TEXT,
			pages INTEGER,
			description TEXT,
			dedications TEXT NOT NULL DEFAULT '[]',
			damages TEXT NOT NULL DEFAULT '[]',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS authors (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS publishers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS locations (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS locations_parent_idx ON locations (parent_id)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS book_authors (
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
			PRIMARY KEY (book_id, author_id)
		)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS book_authors_author_idx ON book_authors (author_id)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS tags (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS book_tags (
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (book_id, tag_id)
		)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS book_tags_tag_idx ON book_tags (tag_id)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS languages (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS book_languages (
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
			PRIMARY KEY (book_id, language_id)
		)`)
	sqlite.exec(
		`CREATE INDEX IF NOT EXISTS book_languages_language_idx ON book_languages (language_id)`,
	)
}

/** Tables that were added after the initial schema. */
function createAuxTables(sqlite: Database): void {
	// Superseded by the per-user book_reads table; it never held user-entered data.
	sqlite.exec(`DROP TABLE IF EXISTS reading_state`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS loans (
			id TEXT PRIMARY KEY,
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			borrower_name TEXT NOT NULL,
			lent_at INTEGER NOT NULL,
			due_at INTEGER,
			returned_at INTEGER
		)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS loans_book_idx ON loans (book_id)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS book_reads (
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			read_at INTEGER NOT NULL,
			PRIMARY KEY (user_id, book_id)
		)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS book_reads_book_idx ON book_reads (book_id)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			display_name TEXT,
			password_hash TEXT NOT NULL,
			is_admin INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS books_owner_idx ON books (owner_id)`)
	sqlite.exec(`CREATE INDEX IF NOT EXISTS books_location_idx ON books (location_id)`)
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS provenance_events (
			id TEXT PRIMARY KEY,
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			kind TEXT NOT NULL,
			occurred_at INTEGER,
			party TEXT,
			price_cents INTEGER,
			created_at INTEGER NOT NULL
		)`)
	sqlite.exec(
		`CREATE INDEX IF NOT EXISTS provenance_events_book_idx ON provenance_events (book_id)`,
	)
	// Legacy NULL buy prices were recorded under the old 'empty = free' convention;
	// going forward NULL means 'price unknown' and 0 means free.
	sqlite.exec(
		`UPDATE provenance_events SET price_cents = 0 WHERE kind = 'buy' AND price_cents IS NULL`,
	)
}

function listTables(sqlite: Database): string[] {
	return sqlite
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
		)
		.all()
		.map((t) => t.name)
}

function listColumns(sqlite: Database, table: string): string[] {
	return sqlite
		.query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)')
		.all(table)
		.map((c) => c.name)
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value)
	} catch {
		return undefined
	}
}

function toPageNote(entry: unknown): PageNote | null {
	const record: Record<string, unknown> =
		typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}
	const rawText =
		typeof entry === 'string'
			? entry
			: (record.text ?? record.dedication ?? record.damage ?? record.note)
	const text = typeof rawText === 'string' ? rawText.trim().slice(0, PAGE_NOTE_LIMITS.text) : ''
	if (!text) return null
	const rawPage = record.page
	const page =
		typeof rawPage === 'string' || typeof rawPage === 'number'
			? String(rawPage).trim().slice(0, PAGE_NOTE_LIMITS.page)
			: ''
	return { page, text }
}

/** Lenient parse of legacy page notes: JSON arrays of strings/objects, or plain text. */
function parsePageNotes(value: string | null): PageNote[] {
	const trimmed = value?.trim()
	if (!trimmed) return []
	const parsed = parseJson(trimmed)
	if (!Array.isArray(parsed)) return [{ page: '', text: trimmed.slice(0, PAGE_NOTE_LIMITS.text) }]
	return parsed
		.map(toPageNote)
		.filter((n): n is PageNote => n !== null)
		.slice(0, PAGE_NOTE_LIMITS.entries)
}

/** Convert legacy plain-text dedications/damages into JSON page-note arrays. */
function migratePageNotesColumns(sqlite: Database): void {
	const cols = listColumns(sqlite, 'books')
	if (!cols.includes('dedications') || !cols.includes('damages')) return
	const rows = sqlite
		.query<{ id: string; dedications: string | null; damages: string | null }, []>(
			'SELECT id, dedications, damages FROM books',
		)
		.all()
	const update = sqlite.prepare('UPDATE books SET dedications = ?, damages = ? WHERE id = ?')
	for (const row of rows) {
		const dedications = JSON.stringify(parsePageNotes(row.dedications))
		const damages = JSON.stringify(parsePageNotes(row.damages))
		update.run(dedications, damages, row.id)
	}
}

/** Add and backfill timestamp columns for databases created before they existed. */
function migrateBookTimestamps(sqlite: Database): void {
	const cols = listColumns(sqlite, 'books')
	for (const col of ['created_at', 'updated_at']) {
		if (cols.includes(col)) continue
		sqlite.exec(`ALTER TABLE books ADD COLUMN ${col} INTEGER NOT NULL DEFAULT 0`)
	}
	// Backfill any zeros left by the DEFAULT 0 (or by very old rows).
	const fallback = Date.now()
	sqlite.exec('UPDATE books SET created_at = updated_at WHERE created_at = 0 AND updated_at <> 0')
	sqlite.exec('UPDATE books SET updated_at = created_at WHERE updated_at = 0 AND created_at <> 0')
	sqlite.prepare('UPDATE books SET created_at = ? WHERE created_at = 0').run(fallback)
	sqlite.prepare('UPDATE books SET updated_at = ? WHERE updated_at = 0').run(fallback)
}

/** Move the former JSON language field into the language catalog. */
function migrateBookLanguages(sqlite: Database): void {
	if (!listColumns(sqlite, 'books').includes('languages')) return
	const rows = sqlite
		.query<{ id: string; languages: string | null }, []>('SELECT id, languages FROM books')
		.all()
	const findLanguage = sqlite.query<{ id: string }, [string]>(
		'SELECT id FROM languages WHERE lower(name) = lower(?)',
	)
	const insertLanguage = sqlite.prepare(
		'INSERT INTO languages (id, name, created_at) VALUES (?, ?, ?)',
	)
	const linkLanguage = sqlite.prepare(
		'INSERT OR IGNORE INTO book_languages (book_id, language_id) VALUES (?, ?)',
	)
	for (const row of rows) {
		const values = parseJson(row.languages ?? '[]')
		if (!Array.isArray(values)) continue
		for (const name of values.map((v) => String(v).trim()).filter(Boolean)) {
			let languageId = findLanguage.get(name)?.id
			if (!languageId) {
				languageId = crypto.randomUUID()
				insertLanguage.run(languageId, name, Date.now())
			}
			linkLanguage.run(row.id, languageId)
		}
	}
}

/** Whether the database holds data from before drizzle migrations were used. */
export function isLegacyDb(sqlite: Database): boolean {
	const tables = listTables(sqlite)
	return tables.includes('books') && !tables.includes('__drizzle_migrations')
}

/**
 * Recreate all tables from the baseline migration and copy the data over, so
 * legacy databases end up with exactly the schema later migrations expect.
 * Requires foreign keys to be off.
 */
function rebuildFromBaseline(sqlite: Database, baseline: MigrationMeta): void {
	const indexes = sqlite
		.query<{ name: string }, []>(
			"SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL",
		)
		.all()
	for (const { name } of indexes) sqlite.exec(`DROP INDEX "${name}"`)
	const legacyTables = listTables(sqlite)
	for (const table of legacyTables) {
		sqlite.exec(`ALTER TABLE "${table}" RENAME TO "legacy_${table}"`)
	}
	for (const stmt of baseline.sql) sqlite.exec(stmt)
	const tables = new Set(listTables(sqlite))
	for (const table of legacyTables) {
		if (tables.has(table)) {
			const legacyCols = new Set(listColumns(sqlite, `legacy_${table}`))
			const cols = listColumns(sqlite, table)
				.filter((c) => legacyCols.has(c))
				.map((c) => `"${c}"`)
				.join(', ')
			sqlite.exec(`INSERT INTO "${table}" (${cols}) SELECT ${cols} FROM "legacy_${table}"`)
		}
		sqlite.exec(`DROP TABLE "legacy_${table}"`)
	}
	const violations = sqlite.query('PRAGMA foreign_key_check').all()
	if (violations.length > 0) throw new Error('Foreign key violations after legacy upgrade')
}

/** Bring a pre-migration database to the baseline migration and mark it applied. */
export function upgradeLegacyDb(sqlite: Database, baseline: MigrationMeta): void {
	sqlite.transaction(() => {
		createCoreTables(sqlite)
		createAuxTables(sqlite)
		migrateBookTimestamps(sqlite)
		migratePageNotesColumns(sqlite)
		migrateBookLanguages(sqlite)
		rebuildFromBaseline(sqlite, baseline)
		sqlite.exec(`
			CREATE TABLE "__drizzle_migrations" (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)`)
		sqlite
			.prepare('INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)')
			.run(baseline.hash, baseline.folderMillis)
	})()
}
