import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { DB_PATH } from '../constants'
import { bookLanguages, books, languages } from '../schema'
import { normalizePageNotes } from '../util/page-notes'
import { createAuxTables, createCoreTables } from './tables'

let db: BunSQLiteDatabase | null = null

/** Convert legacy plain-text dedications/damages into JSON page-note arrays. */
function migratePageNotesColumns(sqlite: Database): void {
	const cols = sqlite
		.query<{ name: string }, []>("SELECT name FROM pragma_table_info('books')")
		.all()
		.map((c) => c.name)
	if (!cols.includes('dedications') || !cols.includes('damages')) return
	const rows = sqlite
		.query<{ id: string; dedications: string | null; damages: string | null }, []>(
			'SELECT id, dedications, damages FROM books',
		)
		.all()
	const update = sqlite.prepare('UPDATE books SET dedications = ?, damages = ? WHERE id = ?')
	for (const row of rows) {
		const dedications = normalizePageNotes(row.dedications)
		const damages = normalizePageNotes(row.damages)
		update.run(JSON.stringify(dedications), JSON.stringify(damages), row.id)
	}
}

export function initDb(path: string = DB_PATH): BunSQLiteDatabase {
	mkdirSync(dirname(path), { recursive: true })
	const sqlite = new Database(path)
	sqlite.exec('PRAGMA journal_mode = WAL;')
	sqlite.exec('PRAGMA foreign_keys = ON;')
	db = drizzle(sqlite)
	createCoreTables(db)
	createAuxTables(db)
	migratePageNotesColumns(sqlite)
	// Migrate the former JSON language field into the catalog once. The old
	// column remains for compatibility with existing databases, but is no
	// longer written by the application.
	const legacyBooks = db.select().from(books).all()
	for (const book of legacyBooks) {
		const values = Array.isArray(book.languages) ? book.languages : []
		for (const raw of values) {
			const name = String(raw).trim()
			if (!name) continue
			let language = db
				.select()
				.from(languages)
				.where(sql`lower(${languages.name}) = lower(${name})`)
				.get()
			if (!language) {
				const id = crypto.randomUUID()
				db.insert(languages).values({ id, name, createdAt: Date.now() }).run()
				language = db.select().from(languages).where(eq(languages.id, id)).get()
			}
			if (language)
				db.insert(bookLanguages)
					.values({ bookId: book.id, languageId: language.id })
					.onConflictDoNothing()
					.run()
		}
	}
	return db
}

export function getDb(): BunSQLiteDatabase {
	if (!db) {
		return initDb()
	}
	return db
}
