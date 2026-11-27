// Quick add (DESIGN §5.1): pick a type, take or choose a photo, enter the
// name, save. Everything else sits in "Weitere Angaben" on the same page,
// except fields the type requires: those show right below the name, so a
// first save never fails on a field the user could not see.
// The item is created first; photos are uploaded once it exists. A failed
// upload keeps the item and the photos and offers a retry.
import { createForm } from '@tanstack/solid-form'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { createFileRoute, Link, notFound, useBlocker, useNavigate } from '@tanstack/solid-router'
import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import { z } from 'zod'
import { attachmentErrorText } from '~/components/attachments/errors'
import { downscaleForUpload, uploadFile } from '~/components/attachments/upload-client'
import { AttributeFields } from '~/components/item-types/attribute-fields'
import { type FoundBook, IsbnFill } from '~/components/items/isbn-fill'
import {
	applyAttributeErrors,
	focusFirstError,
	ItemBaseFields,
	NameField,
} from '~/components/items/item-form'
import { LocationPicker, type Placement, placementInput } from '~/components/items/location-picker'
import { OwnerSelect, type OwnerValue } from '~/components/items/owner-picker'
import { TypeChoice } from '~/components/items/type-choice'
import { VisibilityChoice } from '~/components/items/visibility-choice'
import { Button, buttonVariants } from '~/components/ui/button'
import { MAX_FILE_BYTES } from '~/lib/attachments/rules'
import { goToLogin } from '~/lib/error-text'
import { activeFields, type FieldDefinition } from '~/lib/item-types/fields'
import { itemTypeQuery, itemTypesQuery } from '~/lib/item-types/queries'
import { flattenTree } from '~/lib/item-types/tree'
import { parseItemsError } from '~/lib/items/errors'
import { type BaseErrors, emptyBaseValues, parseBaseValues } from '~/lib/items/form'
import { locationsQuery, principalsQuery, tagsQuery } from '~/lib/items/queries'
import { runAction } from '~/lib/run-action'
import { m } from '~/paraglide/messages'
import { createItemFn } from '~/server/items/functions'

const searchSchema = z.object({
	type: z.string().max(64).optional().catch(undefined),
	loc: z.string().max(64).optional().catch(undefined),
	container: z.string().max(64).optional().catch(undefined),
	/** A scanned code without a match: prefilled as the barcode. */
	barcode: z.string().max(64).optional().catch(undefined),
	/** A scanned ISBN-13 without a match: a type with an ISBN field, filled in by lookup. */
	isbn: z.string().max(20).optional().catch(undefined),
})

const LAST_TYPE_KEY = 'hm.lastTypeId'

export const Route = createFileRoute('/_authed/items/new')({
	validateSearch: searchSchema,
	beforeLoad: ({ context }) => {
		if (context.user.role === 'guest') throw notFound()
	},
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(itemTypesQuery(false)),
			context.queryClient.ensureQueryData(locationsQuery()),
			context.queryClient.ensureQueryData(principalsQuery()),
			context.queryClient.ensureQueryData(tagsQuery()),
		]),
	head: () => ({ meta: [{ title: `${m.item_new_title()} · ${m.app_name()}` }] }),
	component: NewItemPage,
})

type Photo = { file: File; url: string }

function NewItemPage() {
	const ctx = Route.useRouteContext()
	const search = Route.useSearch()
	const navigate = useNavigate()
	const qc = useQueryClient()
	const types = useQuery(() => itemTypesQuery(false))

	const [typeId, setTypeId] = createSignal<string | null>(search().type ?? null)
	const type = useQuery(() => ({ ...itemTypeQuery(typeId() ?? ''), enabled: !!typeId() }))
	const [base, setBase] = createStore({ ...emptyBaseValues(), barcode: search().barcode ?? '' })
	const [errors, setErrors] = createSignal<BaseErrors>({})
	const [typeError, setTypeError] = createSignal<string>()
	const [owner, setOwner] = createSignal<OwnerValue>({ ownerKind: 'household', ownerId: null })
	const [visibility, setVisibility] = createSignal<'household' | 'private'>('household')
	const [place, setPlace] = createSignal<Placement>({
		locationId: search().container ? null : (search().loc ?? null),
		containerItemId: search().container ?? null,
	})
	const [photos, setPhotos] = createSignal<Photo[]>([])
	const [busy, setBusy] = createSignal(false)
	const [created, setCreated] = createSignal<{ id: string } | null>(null)
	const [uploadError, setUploadError] = createSignal<string | null>(null)
	const [uploadStatus, setUploadStatus] = createSignal('')
	const [touched, setTouched] = createSignal(false)
	const [moreOpen, setMoreOpen] = createSignal(
		!!(search().loc || search().container || search().barcode),
	)

	// A scanned ISBN without a type: the starter type "book" if it exists.
	createEffect(() => {
		if (typeId() || search().type || !search().isbn) return
		const book = flattenTree(types.data ?? []).find((t) => t.key === 'book')
		if (book) setTypeId(book.id)
	})
	// Remember the last type for the next quick add.
	createEffect(() => {
		if (typeId() || search().type || search().isbn) return
		try {
			const last = localStorage.getItem(LAST_TYPE_KEY)
			if (last && JSON.stringify(types.data ?? []).includes(`"id":"${last}"`)) setTypeId(last)
		} catch {
			// storage unavailable: no preselection
		}
	})
	createEffect(() => {
		if (owner().ownerKind === 'household') setVisibility('household')
	})
	onCleanup(() => {
		for (const p of photos()) URL.revokeObjectURL(p.url)
	})

	// ISBN auto-fill: for types whose ISBN field names lookup sources.
	const isbnField = () =>
		activeFields(type.data?.effectiveFields ?? []).some(
			(f) =>
				f.kind === 'isbn' &&
				!!(f as Extract<FieldDefinition, { kind: 'isbn' }>).lookup?.length,
		)
	let autoName = ''
	function applyBook(r: FoundBook) {
		setTouched(true)
		if (!base.name.trim() || base.name === autoName) setBase('name', r.name)
		autoName = r.name
		const set = form.setFieldValue as (name: string, value: unknown) => void
		for (const [k, v] of Object.entries(r.attributes)) set(`attributes.${k}`, v)
	}

	const form = createForm(() => ({
		defaultValues: { attributes: {} as Record<string, unknown> },
		onSubmit: ({ value }) => save(value.attributes),
	}))

	useBlocker({
		shouldBlockFn: () => touched() && !created() && !window.confirm(m.item_leave_confirm()),
		enableBeforeUnload: () => touched() && !created(),
	})

	function addPhotos(list: FileList | null) {
		if (!list) return
		setTouched(true)
		setPhotos((p) => [
			...p,
			...[...list].map((file) => ({ file, url: URL.createObjectURL(file) })),
		])
	}
	function removePhoto(i: number) {
		const p = photos()[i]
		if (p) URL.revokeObjectURL(p.url)
		setPhotos((list) => list.filter((_, j) => j !== i))
	}

	let parsed: ReturnType<typeof parseBaseValues> | null = null

	async function onSubmit(e: SubmitEvent) {
		e.preventDefault()
		if (busy()) return
		if (created()) return void uploadAll()
		setTypeError(typeId() ? undefined : m.item_error_type_required())
		parsed = parseBaseValues(base, { withPrice: true })
		setErrors(parsed.ok ? {} : parsed.errors)
		await form.handleSubmit()
		const required = new Set(requiredFields().map((f) => `attributes.${f.key}`))
		const attrsInvalid = Object.entries(form.state.fieldMeta ?? {}).some(
			([k, meta]) => !required.has(k) && (meta?.errors?.length ?? 0) > 0,
		)
		if ((!parsed.ok && Object.keys(parsed.errors).some((k) => k !== 'name')) || attrsInvalid)
			setMoreOpen(true)
		if (!typeId()) document.getElementsByName('new-type')[0]?.focus()
		else if (!parsed.ok) focusFirstError('new', parsed.errors)
		else {
			const bad = requiredFields().find(
				(f) => (form.state.fieldMeta?.[`attributes.${f.key}`]?.errors?.length ?? 0) > 0,
			)
			if (bad) document.getElementById(`new-attr-${bad.key}`)?.focus()
		}
	}

	async function save(attrs: Record<string, unknown>) {
		const tid = typeId()
		if (!tid || !parsed?.ok) return
		const keys = new Set(activeFields(type.data?.effectiveFields ?? []).map((f) => f.key))
		const attributes = Object.fromEntries(Object.entries(attrs).filter(([k]) => keys.has(k)))
		const { priceCents, ...rest } = parsed.data
		setBusy(true)
		const r = await runAction(
			() =>
				createItemFn({
					data: {
						typeId: tid,
						...rest,
						priceCents: priceCents ?? null,
						attributes,
						owner: owner(),
						visibility: visibility(),
						...placementInput(place()),
					},
				}),
			{
				onError: (err) => {
					const p = parseItemsError(err)
					if (p.code === 'ATTRIBUTES_INVALID') {
						const req = new Set(requiredFields().map((f) => f.key))
						if (Object.keys(p.fieldErrors).some((k) => !req.has(k))) setMoreOpen(true)
						applyAttributeErrors(form, p.fieldErrors, { idPrefix: 'new-attr' })
					}
					return false
				},
			},
		)
		setBusy(false)
		if (!r) return
		try {
			localStorage.setItem(LAST_TYPE_KEY, tid)
		} catch {
			// ignore
		}
		setCreated({ id: r.id })
		await qc.invalidateQueries({ queryKey: ['items'] })
		await qc.invalidateQueries({ queryKey: ['locations'] })
		await qc.invalidateQueries({ queryKey: ['tags'] })
		await uploadAll()
	}

	/** Uploads the remaining photos; stops at the first failure (the item stays). */
	async function uploadAll() {
		const c = created()
		if (!c) return
		setBusy(true)
		setUploadError(null)
		while (photos().length) {
			const p = photos()[0]!
			setUploadStatus(m.item_new_uploading({ total: photos().length }))
			const file = await downscaleForUpload(p.file, 'photo')
			const r =
				file.size > MAX_FILE_BYTES
					? ({ ok: false, code: 'ATTACHMENTS_TOO_LARGE', status: 413 } as const)
					: await uploadFile(c.id, 'photo', file, () => {})
			if (!r.ok) {
				if (r.code === 'Not authenticated') return goToLogin()
				setUploadError(attachmentErrorText(r.code))
				setUploadStatus('')
				setBusy(false)
				return
			}
			removePhoto(0)
		}
		setUploadStatus('')
		setBusy(false)
		await qc.invalidateQueries({ queryKey: ['items'] })
		await navigate({ to: '/items/$itemId', params: { itemId: c.id } })
	}

	// Required active fields go next to the name; the rest into "Weitere Angaben".
	const requiredFields = () =>
		activeFields(type.data?.effectiveFields ?? []).filter((f) => f.required)
	const optionalFields = () =>
		(type.data?.effectiveFields ?? []).filter((f) => !(f.required && !f.hidden))

	let camera!: HTMLInputElement
	let picker!: HTMLInputElement

	return (
		<div class="grid gap-4">
			<div class="flex items-center gap-2">
				<h1 class="text-2xl font-semibold">{m.item_new_title()}</h1>
				<Link
					to="/items"
					class="ml-auto text-sm text-primary underline-offset-4 hover:underline"
				>
					{m.common_cancel()}
				</Link>
			</div>

			<Show when={created()}>
				{(c) => (
					<div role="alert" class="grid gap-3 rounded-md border border-destructive p-3">
						<Show
							when={uploadError()}
							fallback={<p class="text-sm">{uploadStatus() || m.item_new_saved()}</p>}
						>
							<p class="text-sm font-medium">{m.item_new_upload_failed()}</p>
							<p class="text-sm text-destructive">{uploadError()}</p>
							<div class="flex flex-wrap gap-2">
								<Button onClick={() => void uploadAll()} disabled={busy()}>
									{m.attachments_retry()}
								</Button>
								<Link
									class={buttonVariants({ variant: 'outline' })}
									to="/items/$itemId"
									params={{ itemId: c().id }}
								>
									{m.item_new_continue_without_photo()}
								</Link>
							</div>
						</Show>
					</div>
				)}
			</Show>

			<form
				class="grid gap-5"
				noValidate
				onSubmit={onSubmit}
				onInput={() => setTouched(true)}
			>
				<Show
					when={(types.data ?? []).length > 0}
					fallback={
						<p class="rounded-md border bg-muted p-3 text-sm">
							{m.item_new_no_types()}{' '}
							<Link to="/admin/types/new" class="text-primary underline">
								{m.item_new_create_type()}
							</Link>
						</p>
					}
				>
					<TypeChoice
						name="new-type"
						types={types.data ?? []}
						value={typeId()}
						onChange={(id) => {
							setTypeId(id)
							setTypeError(undefined)
							setTouched(true)
						}}
						error={typeError()}
						disabled={!!created()}
					/>
				</Show>

				<section class="grid gap-2" aria-labelledby="new-photos-h">
					<h2 id="new-photos-h" class="text-sm font-medium">
						{m.attachments_photos()}
					</h2>
					<Show when={photos().length}>
						<ul
							class="grid grid-cols-4 gap-2 sm:grid-cols-6"
							aria-label={m.item_new_selected_photos()}
						>
							<For each={photos()}>
								{(p, i) => (
									<li class="relative">
										<img
											src={p.url}
											alt={m.attachments_photo_alt({
												n: i() + 1,
												total: photos().length,
											})}
											class="aspect-square w-full rounded-md border object-cover"
										/>
										<button
											type="button"
											class="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-background/90 text-sm shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											aria-label={m.item_new_remove_photo({ n: i() + 1 })}
											disabled={busy()}
											onClick={() => removePhoto(i())}
										>
											✕
										</button>
									</li>
								)}
							</For>
						</ul>
					</Show>
					<div class="flex flex-wrap gap-2">
						<Button
							type="button"
							variant="secondary"
							disabled={busy()}
							onClick={() => camera.click()}
						>
							{m.attachments_take_photo()}
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={busy()}
							onClick={() => picker.click()}
						>
							{m.item_new_pick_photo()}
						</Button>
					</div>
					<input
						ref={camera}
						type="file"
						accept="image/*"
						capture="environment"
						class="sr-only"
						tabIndex={-1}
						aria-hidden="true"
						onChange={(e) => {
							addPhotos(e.currentTarget.files)
							e.currentTarget.value = ''
						}}
					/>
					<input
						ref={picker}
						type="file"
						accept="image/*,.heic,.heif"
						multiple
						class="sr-only"
						tabIndex={-1}
						aria-hidden="true"
						data-testid="photo-input"
						onChange={(e) => {
							addPhotos(e.currentTarget.files)
							e.currentTarget.value = ''
						}}
					/>
				</section>

				<Show when={typeId() && isbnField() ? typeId() : null} keyed>
					{(tid) => (
						<IsbnFill
							typeId={tid}
							initial={search().isbn}
							onFound={applyBook}
							onIsbn={(isbn) => {
								const set = form.setFieldValue as (
									name: string,
									value: unknown,
								) => void
								for (const f of activeFields(type.data?.effectiveFields ?? []))
									if (f.kind === 'isbn') set(`attributes.${f.key}`, isbn)
							}}
							disabled={!!created()}
						/>
					)}
				</Show>

				<NameField
					id="new-name"
					value={base.name}
					onInput={(v) => setBase('name', v)}
					error={errors().name}
					disabled={!!created()}
				/>

				<Show when={requiredFields().length}>
					<AttributeFields
						form={form}
						fields={requiredFields()}
						idPrefix="new-attr"
						disabled={!!created()}
					/>
				</Show>

				<details
					class="group rounded-md border"
					open={moreOpen()}
					onToggle={(e) => setMoreOpen(e.currentTarget.open)}
				>
					<summary class="flex min-h-12 cursor-pointer items-center px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
						{m.item_new_more()}
					</summary>
					<div class="grid gap-5 border-t p-3">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="grid content-start gap-2">
								<label for="new-owner" class="text-sm font-medium">
									{m.item_field_owner()}
								</label>
								<OwnerSelect
									id="new-owner"
									user={ctx().user}
									value={owner()}
									onChange={setOwner}
									disabled={!!created()}
								/>
							</div>
							<VisibilityChoice
								name="new-visibility"
								value={visibility()}
								onChange={setVisibility}
								householdOwned={owner().ownerKind === 'household'}
								disabled={!!created()}
							/>
						</div>
						<LocationPicker
							id="new-place"
							value={place()}
							onChange={setPlace}
							disabled={!!created()}
						/>
						<ItemBaseFields
							idPrefix="new"
							values={base}
							set={setBase}
							errors={errors()}
							withPrice
							stock={type.data?.tracking === 'stock'}
							disabled={!!created()}
						/>
						<Show
							when={
								type.data && activeFields(optionalFields()).length
									? type.data
									: null
							}
						>
							{(t) => (
								<section class="grid gap-3" aria-labelledby="new-attrs-h">
									<h2 id="new-attrs-h" class="font-medium">
										{m.item_type_fields({ type: t().name })}
									</h2>
									<AttributeFields
										form={form}
										fields={optionalFields()}
										idPrefix="new-attr"
										disabled={!!created()}
									/>
								</section>
							)}
						</Show>
					</div>
				</details>

				<div class="sticky bottom-20 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
					<Button type="submit" size="lg" class="w-full sm:w-auto" disabled={busy()}>
						{busy()
							? m.item_saving()
							: created()
								? m.attachments_retry()
								: m.common_save()}
					</Button>
					<Show when={uploadStatus()}>
						<p role="status" class="mt-2 text-sm text-muted-foreground">
							{uploadStatus()}
						</p>
					</Show>
				</div>
			</form>
		</div>
	)
}
