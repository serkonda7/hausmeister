// Drizzle handle for the FTS5 table `items_fts` (created by the hand-written
// migration drizzle/0001_*.sql). Deliberately NOT in db/schema.ts, so
// drizzle-kit never tries to manage the virtual table.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const itemsFts = sqliteTable('items_fts', {
	itemId: text('item_id').notNull(),
	name: text('name'),
	description: text('description'),
	tags: text('tags'),
	attrs: text('attrs'),
})
