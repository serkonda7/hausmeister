import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { DB_PATH, MIGRATIONS_DIR } from '../constants'
import { isLegacyDb, upgradeLegacyDb } from './legacy'

export type Db = BunSQLiteDatabase

let db: Db | null = null

export function initDb(path: string = DB_PATH): Db {
	mkdirSync(dirname(path), { recursive: true })
	const sqlite = new Database(path)
	sqlite.exec('PRAGMA journal_mode = WAL;')
	db = drizzle(sqlite)
	// Table rebuilds in SQLite migrations require foreign keys to be off, and the
	// pragma is a no-op inside the migrator's transaction.
	sqlite.exec('PRAGMA foreign_keys = OFF;')
	if (isLegacyDb(sqlite)) {
		const [baseline] = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR })
		if (!baseline) throw new Error('Missing baseline migration')
		upgradeLegacyDb(sqlite, baseline)
	}
	migrate(db, { migrationsFolder: MIGRATIONS_DIR })
	// Deletes rely on the schema's ON DELETE CASCADE / SET NULL rules.
	sqlite.exec('PRAGMA foreign_keys = ON;')
	return db
}

export function getDb(): Db {
	return db ?? initDb()
}
