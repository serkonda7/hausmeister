// A consistent read view for one export: its own read-only connection in one
// read transaction. In WAL mode that sees the database as of its first read
// while the app keeps writing, so items, attachments and events agree.
// Cost: the WAL grows while the snapshot is open and shrinks after it.
// Blobs are immutable; one deleted by gc meanwhile is marked missing.
// In-memory databases (tests) can't be opened twice: there the export reads
// the given connection directly.
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import type { AppDb } from '../db/client'
import * as schema from '../db/schema'

export type Snapshot = { db: AppDb; isolated: boolean; close(): void }

function fileOf(db: AppDb): string | null {
	const name = db.$client.filename
	return !name || name === ':memory:' ? null : name
}

export function openSnapshot(db: AppDb): Snapshot {
	const file = fileOf(db)
	if (!file) return { db, isolated: false, close() {} }
	const sqlite = new Database(file, { readonly: true, strict: true })
	try {
		sqlite.exec('PRAGMA busy_timeout = 5000')
		sqlite.exec('PRAGMA query_only = ON')
		sqlite.exec('BEGIN')
		// A deferred transaction takes its snapshot at the first read.
		sqlite.query('SELECT count(*) FROM items').get()
	} catch (err) {
		sqlite.close()
		throw err
	}
	const snap = drizzle({ client: sqlite, schema }) as AppDb
	let closed = false
	return {
		db: snap,
		isolated: true,
		close() {
			if (closed) return
			closed = true
			try {
				sqlite.exec('COMMIT')
			} catch {
				// nothing to commit in a read transaction that failed
			}
			sqlite.close()
		},
	}
}
