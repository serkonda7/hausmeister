import { inArray, type SQL, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Db } from '../db'
import { fail } from './http'

/** Case-insensitive equality, used for unique names. */
export function ieq(column: SQLiteColumn, value: string): SQL {
	return sql`lower(${column}) = lower(${value})`
}

export function byName(a: { name: string }, b: { name: string }): number {
	return a.name.localeCompare(b.name)
}

/** Fail with 400 unless every id exists in the table of `idColumn`. */
export function ensureIdsExist(db: Db, idColumn: SQLiteColumn, ids: string[], label: string): void {
	const unique = [...new Set(ids)]
	if (unique.length === 0) return
	const found = db
		.select({ id: idColumn })
		.from(idColumn.table)
		.where(inArray(idColumn, unique))
		.all()
	if (found.length !== unique.length) fail(400, `Unknown ${label} id`)
}

/** Group rows into lists keyed by `key(row)`. */
export function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
	const map = new Map<string, T[]>()
	for (const row of rows) {
		const list = map.get(key(row))
		if (list) list.push(row)
		else map.set(key(row), [row])
	}
	return map
}
