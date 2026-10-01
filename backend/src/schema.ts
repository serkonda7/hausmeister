import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from 'drizzle-orm/sqlite-core'
import type { PageNote } from 'shared/src/book'

export const authors = sqliteTable('authors', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	createdAt: integer('created_at').notNull(),
})

export const publishers = sqliteTable('publishers', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	createdAt: integer('created_at').notNull(),
})

export const locations = sqliteTable('locations', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	parentId: text('parent_id').references((): AnySQLiteColumn => locations.id, {
		onDelete: 'set null',
	}),
	createdAt: integer('created_at').notNull(),
})

export const tags = sqliteTable('tags', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	createdAt: integer('created_at').notNull(),
})

export const languages = sqliteTable('languages', {
	id: text('id').primaryKey(),
	name: text('name').notNull().unique(),
	createdAt: integer('created_at').notNull(),
})

export const books = sqliteTable('books', {
	id: text('id').primaryKey(),
	isbn: text('isbn'),
	title: text('title').notNull(),
	subtitle: text('subtitle'),
	publisherId: text('publisher_id').references(() => publishers.id, { onDelete: 'set null' }),
	ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
	locationId: text('location_id').references(() => locations.id, { onDelete: 'set null' }),
	printYear: integer('print_year'),
	languages: text('languages', { mode: 'json' }).$type<string[]>().notNull().default([]),
	coverUrl: text('cover_url'),
	pages: integer('pages'),
	description: text('description'),
	dedications: text('dedications', { mode: 'json' }).$type<PageNote[]>().notNull().default([]),
	damages: text('damages', { mode: 'json' }).$type<PageNote[]>().notNull().default([]),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull(),
})

export const provenanceEvents = sqliteTable(
	'provenance_events',
	{
		id: text('id').primaryKey(),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		occurredAt: integer('occurred_at'),
		party: text('party'),
		priceCents: integer('price_cents'),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('provenance_events_book_idx').on(t.bookId)],
)

export const bookAuthors = sqliteTable(
	'book_authors',
	{
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		authorId: text('author_id')
			.notNull()
			.references(() => authors.id, { onDelete: 'cascade' }),
	},
	(t) => [
		primaryKey({ columns: [t.bookId, t.authorId] }),
		index('book_authors_author_idx').on(t.authorId),
	],
)

export const bookTags = sqliteTable(
	'book_tags',
	{
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		tagId: text('tag_id')
			.notNull()
			.references(() => tags.id, { onDelete: 'cascade' }),
	},
	(t) => [primaryKey({ columns: [t.bookId, t.tagId] }), index('book_tags_tag_idx').on(t.tagId)],
)

export const bookLanguages = sqliteTable(
	'book_languages',
	{
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		languageId: text('language_id')
			.notNull()
			.references(() => languages.id, { onDelete: 'cascade' }),
	},
	(t) => [
		primaryKey({ columns: [t.bookId, t.languageId] }),
		index('book_languages_language_idx').on(t.languageId),
	],
)

/** Per-user "I have read this book" marks (the personal reading list). */
export const bookReads = sqliteTable(
	'book_reads',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		readAt: integer('read_at').notNull(),
	},
	(t) => [primaryKey({ columns: [t.userId, t.bookId] }), index('book_reads_book_idx').on(t.bookId)],
)

export const loans = sqliteTable(
	'loans',
	{
		id: text('id').primaryKey(),
		bookId: text('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		borrowerName: text('borrower_name').notNull(),
		lentAt: integer('lent_at').notNull(),
		dueAt: integer('due_at'),
		returnedAt: integer('returned_at'),
	},
	(t) => [index('loans_book_idx').on(t.bookId)],
)

export const users = sqliteTable('users', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	displayName: text('display_name'),
	passwordHash: text('password_hash').notNull(),
	isAdmin: integer('is_admin').notNull().default(0),
	createdAt: integer('created_at').notNull(),
})

export const sessions = sqliteTable(
	'sessions',
	{
		token: text('token').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull(),
	},
	(t) => [index('sessions_user_idx').on(t.userId)],
)
