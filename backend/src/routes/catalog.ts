import { vValidator } from '@hono/valibot-validator'
import { count, eq } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import { AuthorSchemas, LanguageSchemas, PublisherSchemas, TagSchemas } from 'shared/src/book'
import { type Db, getDb } from '../db'
import {
	authors,
	bookAuthors,
	bookLanguages,
	books,
	bookTags,
	languages,
	publishers,
	tags,
} from '../schema'
import type { AppEnv } from '../util/auth'
import { fail } from '../util/http'
import { byName, ieq } from '../util/query'

type NamedTable = typeof authors | typeof publishers | typeof tags | typeof languages

type NamedCatalog = {
	table: NamedTable
	/** Column referencing the entry id; its rows are the entry's books. */
	bookRef: SQLiteColumn
	schemas: typeof AuthorSchemas
	/** Response keys and error label, e.g. `authors` / `author` / `Author`. */
	many: string
	one: string
	label: string
}

/** CRUD routes for a catalog of uniquely named entries (authors, tags, …). */
function namedCatalogApp({ table, bookRef, schemas, many, one, label }: NamedCatalog) {
	const findById = (db: Db, id: string) => db.select().from(table).where(eq(table.id, id)).get()

	function assertNameFree(db: Db, name: string, ownId?: string): void {
		const existing = db.select().from(table).where(ieq(table.name, name)).get()
		if (existing && existing.id !== ownId) fail(409, `${label} already exists`)
	}

	return new Hono<AppEnv>()
		.get('/', (c) => {
			const db = getDb()
			const q = c.req.query('q')?.toLowerCase() ?? ''
			const counts = db
				.select({ id: bookRef, count: count() })
				.from(bookRef.table)
				.groupBy(bookRef)
				.all()
			const countById = new Map(counts.map((r) => [r.id, r.count]))
			const rows = db
				.select()
				.from(table)
				.all()
				.filter((r) => r.name.toLowerCase().includes(q))
				.sort(byName)
				.map((r) => ({ ...r, bookCount: countById.get(r.id) ?? 0 }))
			return c.json({ [many]: rows })
		})
		.post('/', vValidator('json', schemas.create), (c) => {
			const db = getDb()
			const { name } = c.req.valid('json')
			assertNameFree(db, name)
			const row = { id: crypto.randomUUID(), name, createdAt: Date.now() }
			db.insert(table).values(row).run()
			return c.json({ [one]: row }, 201)
		})
		.patch('/:id', vValidator('json', schemas.update), (c) => {
			const db = getDb()
			const id = c.req.param('id')
			const { name } = c.req.valid('json')
			if (!findById(db, id)) fail(404, 'Not found')
			if (name !== undefined) {
				assertNameFree(db, name, id)
				db.update(table).set({ name }).where(eq(table.id, id)).run()
			}
			return c.json({ [one]: findById(db, id) })
		})
		.delete('/:id', (c) => {
			// Book links cascade (publishers: books keep a null publisher).
			getDb()
				.delete(table)
				.where(eq(table.id, c.req.param('id')))
				.run()
			return c.json({ ok: true })
		})
}

export const authorApp = namedCatalogApp({
	table: authors,
	bookRef: bookAuthors.authorId,
	schemas: AuthorSchemas,
	many: 'authors',
	one: 'author',
	label: 'Author',
})

export const publisherApp = namedCatalogApp({
	table: publishers,
	bookRef: books.publisherId,
	schemas: PublisherSchemas,
	many: 'publishers',
	one: 'publisher',
	label: 'Publisher',
})

export const tagApp = namedCatalogApp({
	table: tags,
	bookRef: bookTags.tagId,
	schemas: TagSchemas,
	many: 'tags',
	one: 'tag',
	label: 'Tag',
})

export const languageApp = namedCatalogApp({
	table: languages,
	bookRef: bookLanguages.languageId,
	schemas: LanguageSchemas,
	many: 'languages',
	one: 'language',
	label: 'Language',
})
