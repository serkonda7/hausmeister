import { sql } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'

/** Fresh-schema table creation. Idempotent via IF NOT EXISTS. */
export function createCoreTables(db: BunSQLiteDatabase): void {
	db.run(sql`
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
			dedications TEXT,
			damages TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS authors (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS publishers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS locations (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS locations_parent_idx ON locations (parent_id)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS book_authors (
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
			PRIMARY KEY (book_id, author_id)
		)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS book_authors_author_idx ON book_authors (author_id)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS tags (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS book_tags (
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
			PRIMARY KEY (book_id, tag_id)
		)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS book_tags_tag_idx ON book_tags (tag_id)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS languages (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS book_languages (
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
			PRIMARY KEY (book_id, language_id)
		)`)
	db.run(
		sql`CREATE INDEX IF NOT EXISTS book_languages_language_idx ON book_languages (language_id)`,
	)
}

/** Tables that were added after the initial schema. */
export function createAuxTables(db: BunSQLiteDatabase): void {
	db.run(sql`
		CREATE TABLE IF NOT EXISTS reading_state (
			book_id TEXT PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'want',
			progress_pages INTEGER NOT NULL DEFAULT 0,
			rating INTEGER,
			notes TEXT,
			started_at INTEGER,
			finished_at INTEGER
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS loans (
			id TEXT PRIMARY KEY,
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			borrower_name TEXT NOT NULL,
			lent_at INTEGER NOT NULL,
			due_at INTEGER,
			returned_at INTEGER
		)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS loans_book_idx ON loans (book_id)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL UNIQUE,
			display_name TEXT,
			password_hash TEXT NOT NULL,
			is_admin INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS books_owner_idx ON books (owner_id)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS books_location_idx ON books (location_id)`)
	db.run(sql`
		CREATE TABLE IF NOT EXISTS provenance_events (
			id TEXT PRIMARY KEY,
			book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
			kind TEXT NOT NULL,
			occurred_at INTEGER,
			party TEXT,
			price_cents INTEGER,
			created_at INTEGER NOT NULL
		)`)
	db.run(sql`CREATE INDEX IF NOT EXISTS provenance_events_book_idx ON provenance_events (book_id)`)
	// Legacy NULL buy prices were recorded under the old 'empty = free' convention;
	// going forward NULL means 'price unknown' and 0 means free.
	db.run(
		sql`UPDATE provenance_events SET price_cents = 0 WHERE kind = 'buy' AND price_cents IS NULL`,
	)
}
