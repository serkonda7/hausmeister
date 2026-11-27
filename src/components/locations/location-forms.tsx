// Create, edit, move and delete locations. The server enforces the rights
// (admins and members write; members delete only empty locations).
import { useQueryClient } from '@tanstack/solid-query'
import { useNavigate } from '@tanstack/solid-router'
import { createSignal, For, Show } from 'solid-js'
import { ConfirmButton } from '~/components/confirm-dialog'
import { LocationSelect } from '~/components/items/location-picker'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input, inputClass } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { LOCATION_KINDS, type LocationKind } from '~/lib/items/constants'
import { locationKindLabel } from '~/lib/items/labels'
import type { LocationDetail } from '~/lib/items/types'
import { runAction } from '~/lib/run-action'
import { m } from '~/paraglide/messages'
import {
	createLocationFn,
	deleteLocationFn,
	moveLocationFn,
	updateLocationFn,
} from '~/server/locations/functions'

export function useRefreshLocations() {
	const qc = useQueryClient()
	return () =>
		Promise.all([
			qc.invalidateQueries({ queryKey: ['locations'] }),
			qc.invalidateQueries({ queryKey: ['items'] }),
		])
}

function KindSelect(props: { id: string; value: LocationKind | null; name?: string }) {
	return (
		<select
			id={props.id}
			name={props.name ?? 'kind'}
			class={inputClass}
			value={props.value ?? ''}
		>
			<option value="" selected={!props.value}>
				{m.locations_kind_none()}
			</option>
			<For each={LOCATION_KINDS}>
				{(k) => (
					<option value={k} selected={k === props.value}>
						{locationKindLabel(k)}
					</option>
				)}
			</For>
		</select>
	)
}

const readForm = (el: HTMLFormElement) => {
	const f = new FormData(el)
	const kind = String(f.get('kind') ?? '')
	return {
		name: String(f.get('name') ?? ''),
		kind: (kind || null) as LocationKind | null,
		notes: String(f.get('notes') ?? ''),
	}
}

/** Name + kind (+ notes) for a new location under `parentId` (null = top level). */
export function CreateLocationForm(props: { parentId: string | null; idPrefix: string }) {
	const refresh = useRefreshLocations()
	const [busy, setBusy] = createSignal(false)
	async function onSubmit(e: SubmitEvent) {
		e.preventDefault()
		const el = e.currentTarget as HTMLFormElement
		const v = readForm(el)
		setBusy(true)
		const r = await runAction(
			() => createLocationFn({ data: { ...v, parentId: props.parentId } }),
			{ success: m.locations_created({ name: v.name.trim() }) },
		)
		setBusy(false)
		if (r) {
			el.reset()
			await refresh()
		}
	}
	return (
		<form class="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end" onSubmit={onSubmit}>
			<div class="grid gap-2">
				<Label for={`${props.idPrefix}-name`}>{m.locations_name()}</Label>
				<Input
					id={`${props.idPrefix}-name`}
					name="name"
					maxLength={80}
					required
					autocomplete="off"
				/>
			</div>
			<div class="grid gap-2">
				<Label for={`${props.idPrefix}-kind`}>{m.locations_kind()}</Label>
				<KindSelect id={`${props.idPrefix}-kind`} value={null} />
			</div>
			<Button type="submit" disabled={busy()}>
				{m.locations_create()}
			</Button>
		</form>
	)
}

export function EditLocationDialog(props: { location: LocationDetail }) {
	const refresh = useRefreshLocations()
	const [open, setOpen] = createSignal(false)
	async function onSubmit(e: SubmitEvent) {
		e.preventDefault()
		const v = readForm(e.currentTarget as HTMLFormElement)
		const r = await runAction(
			() => updateLocationFn({ data: { id: props.location.id, ...v } }),
			{
				success: m.locations_saved(),
			},
		)
		if (r) {
			setOpen(false)
			await refresh()
		}
	}
	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				{m.locations_edit()}
			</Button>
			<Dialog open={open()} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.locations_edit()}</DialogTitle>
					</DialogHeader>
					<form class="grid gap-4" onSubmit={onSubmit}>
						<div class="grid gap-2">
							<Label for="loc-edit-name">{m.locations_name()}</Label>
							<Input
								id="loc-edit-name"
								name="name"
								maxLength={80}
								required
								value={props.location.name}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="loc-edit-kind">{m.locations_kind()}</Label>
							<KindSelect id="loc-edit-kind" value={props.location.kind} />
						</div>
						<div class="grid gap-2">
							<Label for="loc-edit-notes">{m.locations_notes()}</Label>
							<Textarea
								id="loc-edit-notes"
								name="notes"
								maxLength={2000}
								value={props.location.notes ?? ''}
							/>
						</div>
						<DialogFooter>
							<Button variant="outline" type="button" onClick={() => setOpen(false)}>
								{m.common_cancel()}
							</Button>
							<Button type="submit">{m.common_save()}</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	)
}

export function MoveLocationDialog(props: { location: LocationDetail }) {
	const refresh = useRefreshLocations()
	const [open, setOpen] = createSignal(false)
	const [parent, setParent] = createSignal<string | null>(props.location.parentId)
	async function submit() {
		const r = await runAction(
			() => moveLocationFn({ data: { id: props.location.id, parentId: parent() } }),
			{ success: m.locations_moved() },
		)
		if (r) {
			setOpen(false)
			await refresh()
		}
	}
	return (
		<>
			<Button
				variant="outline"
				onClick={() => {
					setParent(props.location.parentId)
					setOpen(true)
				}}
			>
				{m.locations_move()}
			</Button>
			<Dialog open={open()} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{m.locations_move_title({ name: props.location.name })}
						</DialogTitle>
					</DialogHeader>
					<div class="grid gap-2">
						<Label for="loc-move-parent">{m.locations_parent()}</Label>
						<LocationSelect
							id="loc-move-parent"
							value={parent()}
							onChange={setParent}
							noneLabel={m.locations_top_level()}
							excludeSubtreeOf={props.location.id}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							{m.common_cancel()}
						</Button>
						<Button disabled={parent() === props.location.parentId} onClick={submit}>
							{m.locations_move()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

export function DeleteLocationButton(props: { location: LocationDetail; isAdmin: boolean }) {
	const refresh = useRefreshLocations()
	const navigate = useNavigate()
	const qc = useQueryClient()
	const notEmpty = () => props.location.totalCount > 0 || props.location.children.length > 0
	return (
		<Show
			when={props.location.canDelete}
			fallback={
				<Show when={props.location.canEdit && notEmpty()}>
					<p class="basis-full text-sm text-muted-foreground">
						{m.locations_delete_member_hint()}
					</p>
				</Show>
			}
		>
			<ConfirmButton
				label={m.locations_delete()}
				question={
					props.isAdmin && notEmpty()
						? m.locations_delete_question_contents({ name: props.location.name })
						: m.locations_delete_question({ name: props.location.name })
				}
				destructive
				variant="destructive"
				size="default"
				onConfirm={async () => {
					const r = await runAction(
						() => deleteLocationFn({ data: { id: props.location.id } }),
						{
							success: m.locations_deleted({ name: props.location.name }),
						},
					)
					if (!r) return
					const parentId = props.location.parentId
					if (parentId)
						await navigate({
							to: '/locations/$locationId',
							params: { locationId: parentId },
						})
					else await navigate({ to: '/locations' })
					qc.removeQueries({ queryKey: ['locations', 'detail', props.location.id] })
					await refresh()
				}}
			/>
		</Show>
	)
}
