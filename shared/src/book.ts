import * as v from 'valibot'

export const ReadingStatus = v.picklist(['want', 'reading', 'finished', 'abandoned'])
export type ReadingStatus = v.InferOutput<typeof ReadingStatus>

export const AuthorNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
export const PublisherNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
export const TagNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50))
export const LanguageNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50))
export const EntityIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const CreateAuthorSchema = v.object({
	name: AuthorNameSchema,
})
export type CreateAuthor = v.InferOutput<typeof CreateAuthorSchema>

export const UpdateAuthorSchema = v.object({
	name: v.optional(AuthorNameSchema),
})
export type UpdateAuthor = v.InferOutput<typeof UpdateAuthorSchema>

export const CreateTagSchema = v.object({
	name: TagNameSchema,
})
export type CreateTag = v.InferOutput<typeof CreateTagSchema>

export const UpdateTagSchema = v.object({
	name: v.optional(TagNameSchema),
})
export type UpdateTag = v.InferOutput<typeof UpdateTagSchema>

export const CreateLanguageSchema = v.object({ name: LanguageNameSchema })
export type CreateLanguage = v.InferOutput<typeof CreateLanguageSchema>
export const UpdateLanguageSchema = v.object({ name: v.optional(LanguageNameSchema) })
export type UpdateLanguage = v.InferOutput<typeof UpdateLanguageSchema>

export const CreatePublisherSchema = v.object({
	name: PublisherNameSchema,
})
export type CreatePublisher = v.InferOutput<typeof CreatePublisherSchema>

export const UpdatePublisherSchema = v.object({
	name: v.optional(PublisherNameSchema),
})
export type UpdatePublisher = v.InferOutput<typeof UpdatePublisherSchema>

export const LocationNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const CreateLocationSchema = v.object({
	name: LocationNameSchema,
	parentId: v.optional(v.nullable(EntityIdSchema)),
})
export type CreateLocation = v.InferOutput<typeof CreateLocationSchema>

export const UpdateLocationSchema = v.object({
	name: v.optional(LocationNameSchema),
	parentId: v.optional(v.nullable(EntityIdSchema)),
})
export type UpdateLocation = v.InferOutput<typeof UpdateLocationSchema>

export const PageNoteSchema = v.object({
	page: v.pipe(v.string(), v.trim(), v.maxLength(50)),
	text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
})
export type PageNote = v.InferOutput<typeof PageNoteSchema>

export const PageNotesSchema = v.pipe(v.array(PageNoteSchema), v.maxLength(100))
export type PageNotes = v.InferOutput<typeof PageNotesSchema>

export const CreateBookSchema = v.object({
	isbn: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(20))),
	title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300)),
	subtitle: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(300)))),
	authorIds: v.optional(v.array(EntityIdSchema)),
	publisherId: v.optional(v.nullable(EntityIdSchema)),
	tagIds: v.optional(v.array(EntityIdSchema)),
	languageIds: v.optional(v.array(EntityIdSchema)),
	ownerId: v.optional(v.nullable(EntityIdSchema)),
	printYear: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(3000))),
	languages: v.optional(v.array(v.pipe(v.string(), v.trim(), v.maxLength(50)))),
	locationId: v.optional(v.nullable(EntityIdSchema)),
	coverUrl: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000))),
	pages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	description: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(5000))),
	dedications: v.optional(PageNotesSchema),
	damages: v.optional(PageNotesSchema),
})
export type CreateBook = v.InferOutput<typeof CreateBookSchema>

export const UpdateBookSchema = v.partial(CreateBookSchema)
export type UpdateBook = v.InferOutput<typeof UpdateBookSchema>

export const UpdateReadingSchema = v.object({
	status: v.optional(ReadingStatus),
	progressPages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	rating: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5))),
	notes: v.optional(v.pipe(v.string(), v.maxLength(5000))),
})
export type UpdateReading = v.InferOutput<typeof UpdateReadingSchema>

export const LendSchema = v.object({
	borrowerName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
	dueAt: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(30))),
})
export type Lend = v.InferOutput<typeof LendSchema>

export const ProvenanceKind = v.picklist(['buy', 'sell', 'other'])
export type ProvenanceKind = v.InferOutput<typeof ProvenanceKind>

export const PROVENANCE_KINDS: ProvenanceKind[] = ['buy', 'sell', 'other']

export const CreateProvenanceEventSchema = v.object({
	kind: ProvenanceKind,
	occurredAt: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(30))),
	party: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
	priceCents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
})
export type CreateProvenanceEvent = v.InferOutput<typeof CreateProvenanceEventSchema>

export const PROVENANCE_CURRENCY = 'EUR'

export const UpdateProvenanceEventSchema = v.partial(CreateProvenanceEventSchema)
export type UpdateProvenanceEvent = v.InferOutput<typeof UpdateProvenanceEventSchema>

export type OwnershipStatus = 'owned' | 'disposed' | 'unknown'

export const UsernameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(50))
export const DisplayNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100))
export const PasswordSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(200))

export const SetupAdminSchema = v.object({
	username: UsernameSchema,
	displayName: v.optional(DisplayNameSchema),
	password: PasswordSchema,
})
export type SetupAdmin = v.InferOutput<typeof SetupAdminSchema>

export const LoginSchema = v.object({
	username: UsernameSchema,
	password: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})
export type Login = v.InferOutput<typeof LoginSchema>

export const CreateUserSchema = v.object({
	username: UsernameSchema,
	displayName: v.optional(DisplayNameSchema),
	password: PasswordSchema,
	isAdmin: v.optional(v.boolean()),
})
export type CreateUser = v.InferOutput<typeof CreateUserSchema>

export const UpdateUserSchema = v.object({
	username: v.optional(UsernameSchema),
	displayName: v.optional(v.nullable(DisplayNameSchema)),
	password: v.optional(PasswordSchema),
	isAdmin: v.optional(v.boolean()),
})
export type UpdateUser = v.InferOutput<typeof UpdateUserSchema>

export function ownershipFromKinds(kindsInOrder: ProvenanceKind[]): OwnershipStatus {
	if (kindsInOrder.length === 0) {
		return 'unknown'
	}
	const last = kindsInOrder[kindsInOrder.length - 1]
	return last === 'sell' ? 'disposed' : 'owned'
}
