import * as v from 'valibot'

function text(max: number) {
	return v.pipe(v.string(), v.trim(), v.maxLength(max))
}

function requiredText(max: number) {
	return v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max))
}

export const EntityIdSchema = requiredText(200)

/** Create/update schemas for catalog entries that only carry a name. */
function namedEntitySchemas(maxLength: number) {
	const create = v.object({ name: requiredText(maxLength) })
	return { create, update: v.partial(create) }
}

export const AuthorSchemas = namedEntitySchemas(200)
export const PublisherSchemas = namedEntitySchemas(200)
export const TagSchemas = namedEntitySchemas(50)
export const LanguageSchemas = namedEntitySchemas(50)

export const CreateLocationSchema = v.object({
	name: requiredText(200),
	parentId: v.optional(v.nullable(EntityIdSchema)),
})
export const UpdateLocationSchema = v.partial(CreateLocationSchema)

export const PAGE_NOTE_LIMITS = { page: 50, text: 2000, entries: 100 }

export const PageNoteSchema = v.object({
	page: text(PAGE_NOTE_LIMITS.page),
	text: requiredText(PAGE_NOTE_LIMITS.text),
})
export type PageNote = v.InferOutput<typeof PageNoteSchema>

export const PageNotesSchema = v.pipe(
	v.array(PageNoteSchema),
	v.maxLength(PAGE_NOTE_LIMITS.entries),
)

export const CreateBookSchema = v.object({
	isbn: v.optional(text(20)),
	title: requiredText(300),
	subtitle: v.optional(v.nullable(text(300))),
	authorIds: v.optional(v.array(EntityIdSchema)),
	publisherId: v.optional(v.nullable(EntityIdSchema)),
	tagIds: v.optional(v.array(EntityIdSchema)),
	languageIds: v.optional(v.array(EntityIdSchema)),
	ownerId: v.optional(v.nullable(EntityIdSchema)),
	printYear: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3000))),
	locationId: v.optional(v.nullable(EntityIdSchema)),
	coverUrl: v.optional(text(2000)),
	pages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	description: v.optional(text(5000)),
	dedications: v.optional(PageNotesSchema),
	damages: v.optional(PageNotesSchema),
})
export const UpdateBookSchema = v.partial(CreateBookSchema)

export const LendSchema = v.object({
	borrowerName: requiredText(200),
	dueAt: v.optional(text(30)),
})

export const PROVENANCE_KINDS = ['buy', 'sell', 'other'] as const
export const ProvenanceKindSchema = v.picklist(PROVENANCE_KINDS)
export type ProvenanceKind = v.InferOutput<typeof ProvenanceKindSchema>

export const PROVENANCE_CURRENCY = 'EUR'

export const CreateProvenanceEventSchema = v.object({
	kind: ProvenanceKindSchema,
	occurredAt: v.optional(text(30)),
	party: v.optional(text(200)),
	priceCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
})
export const UpdateProvenanceEventSchema = v.partial(CreateProvenanceEventSchema)

export type Ownership = 'owned' | 'disposed' | 'unknown'

/** Ownership implied by the chronologically last provenance event. */
export function ownershipOf(eventsInOrder: Array<{ kind: string }>): Ownership {
	const last = eventsInOrder.at(-1)
	if (!last) return 'unknown'
	return last.kind === 'sell' ? 'disposed' : 'owned'
}

const UsernameSchema = requiredText(50)
const DisplayNameSchema = requiredText(100)
const PasswordSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))

export const LoginSchema = v.object({
	username: UsernameSchema,
	password: PasswordSchema,
})

export const CreateUserSchema = v.object({
	username: UsernameSchema,
	displayName: v.optional(DisplayNameSchema),
	password: PasswordSchema,
	isAdmin: v.optional(v.boolean()),
})
export type CreateUser = v.InferOutput<typeof CreateUserSchema>

export const SetupAdminSchema = v.omit(CreateUserSchema, ['isAdmin'])

export const UpdateUserSchema = v.object({
	username: v.optional(UsernameSchema),
	displayName: v.optional(v.nullable(DisplayNameSchema)),
	password: v.optional(PasswordSchema),
	isAdmin: v.optional(v.boolean()),
})

/** User as exposed by the API (never includes the password hash). */
export type PublicUser = {
	id: string
	username: string
	displayName: string | null
	isAdmin: boolean
	createdAt: number
}

/** Everyone may see all books, but only the owner or an admin may change one. */
export function canEditBook(book: { ownerId: string | null }, user: PublicUser): boolean {
	return user.isAdmin || (book.ownerId !== null && book.ownerId === user.id)
}
