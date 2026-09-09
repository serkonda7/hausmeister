import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'

export const sqlite = new Database('./data.db')
sqlite.exec('PRAGMA journal_mode = WAL;')
sqlite.exec('PRAGMA foreign_keys = ON;')

export const db = drizzle(sqlite)

// Apply pending drizzle migrations (./drizzle). The folder is resolved
// relative to this file so it works regardless of the working directory.
migrate(db, { migrationsFolder: join(import.meta.dir, '../../drizzle') })

export type DB = typeof db
