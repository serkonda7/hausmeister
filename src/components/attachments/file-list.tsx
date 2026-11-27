// List of an item's non-photo attachments of one kind (receipts, manuals,
// other files): open/download links, and for editors kind change, order and
// delete. Receipts only reach callers with `edit` (the server filters them).
//
//   <AttachmentFileList itemId={id} level={level} kind="manual" />
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { createMemo, For, Show } from 'solid-js'
import { ConfirmButton } from '~/components/confirm-dialog'
import { Button } from '~/components/ui/button'
import { inputClass } from '~/components/ui/input'
import {
	ACCEPTED_MIMES,
	ATTACHMENT_KINDS,
	type AttachmentKind,
	fileUrl,
	isImageMime,
} from '~/lib/attachments/rules'
import { cn } from '~/lib/cn'
import { formatDate } from '~/lib/format'
import type { SniffedMime } from '~/lib/mime-sniff'
import { m } from '~/paraglide/messages'
import {
	deleteAttachmentFn,
	reorderAttachmentsFn,
	setAttachmentKindFn,
} from '~/server/attachments/functions'
import type { Level } from '~/server/authz/levels'
import { runAttachmentAction as act } from './action'
import { canEditAttachments, formatBytes, KIND_LABEL } from './format'
import { attachmentsQuery, attachmentsQueryKey } from './queries'

export function AttachmentFileList(props: {
	itemId: string
	level: Level
	kind: Exclude<AttachmentKind, 'photo'>
	/** Hide the "Noch keine Dateien" line (e.g. when a section header already says so). */
	hideEmpty?: boolean
	class?: string
}) {
	const qc = useQueryClient()
	const q = useQuery(() => attachmentsQuery(props.itemId))
	const files = createMemo(() => (q.data?.attachments ?? []).filter((a) => a.kind === props.kind))
	const editable = () => canEditAttachments(q.data?.level ?? props.level)
	const refresh = () => qc.invalidateQueries({ queryKey: attachmentsQueryKey(props.itemId) })

	async function move(index: number, delta: -1 | 1) {
		const ids = files().map((f) => f.id)
		const j = index + delta
		if (j < 0 || j >= ids.length) return
		;[ids[index], ids[j]] = [ids[j]!, ids[index]!]
		const r = await act(() =>
			reorderAttachmentsFn({ data: { itemId: props.itemId, order: ids } }),
		)
		if (r) qc.setQueryData(attachmentsQueryKey(props.itemId), r)
	}

	async function changeKind(attachmentId: string, kind: AttachmentKind) {
		const r = await act(
			() => setAttachmentKindFn({ data: { attachmentId, kind } }),
			m.attachments_kind_changed(),
		)
		await refresh()
		return r
	}

	async function remove(attachmentId: string) {
		if (
			await act(() => deleteAttachmentFn({ data: { attachmentId } }), m.attachments_deleted())
		) {
			await refresh()
		}
	}

	return (
		<div class={cn('grid gap-2', props.class)} data-testid={`attachment-list-${props.kind}`}>
			<Show
				when={files().length > 0}
				fallback={
					<Show when={q.isSuccess && !props.hideEmpty}>
						<p class="text-sm text-muted-foreground">{m.attachments_files_empty()}</p>
					</Show>
				}
			>
				<ul class="grid gap-2">
					<For each={files()}>
						{(f, i) => {
							const name = () => f.originalName ?? m.attachments_unnamed()
							return (
								<li class="grid gap-2 rounded-md border p-2 text-sm">
									<div class="flex items-center gap-3">
										<Show
											when={isImageMime(f.mime)}
											fallback={
												<span
													class="flex size-12 shrink-0 items-center justify-center rounded bg-muted text-xs font-semibold"
													aria-hidden="true"
												>
													PDF
												</span>
											}
										>
											<img
												src={fileUrl(f.id, 'thumb')}
												alt=""
												loading="lazy"
												class="size-12 shrink-0 rounded object-cover"
											/>
										</Show>
										<div class="grid min-w-0 flex-1">
											<a
												href={fileUrl(f.id)}
												target="_blank"
												rel="noopener"
												class="truncate font-medium text-primary underline-offset-4 hover:underline"
											>
												{name()}
											</a>
											<span class="text-xs text-muted-foreground">
												{formatBytes(f.bytes)} · {formatDate(f.createdAt)}
											</span>
										</div>
										<a
											href={`${fileUrl(f.id)}?download=1`}
											class="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
										>
											{m.attachments_download()}
										</a>
									</div>
									<Show when={editable()}>
										<div class="flex flex-wrap items-center gap-2">
											<label class="flex items-center gap-2 text-xs">
												{m.attachments_kind_label()}
												<select
													class={cn(
														inputClass,
														'h-9 w-auto py-1 text-sm',
													)}
													value={f.kind}
													onChange={async (e) => {
														const el = e.currentTarget
														if (
															!(await changeKind(
																f.id,
																el.value as AttachmentKind,
															))
														)
															el.value = f.kind
													}}
												>
													<For
														each={ATTACHMENT_KINDS.filter((k) =>
															ACCEPTED_MIMES[k].includes(
																f.mime as SniffedMime,
															),
														)}
													>
														{(k) => (
															<option value={k}>
																{KIND_LABEL[k]()}
															</option>
														)}
													</For>
												</select>
											</label>
											<Button
												size="sm"
												variant="ghost"
												aria-label={m.attachments_move_earlier()}
												disabled={i() === 0}
												onClick={() => move(i(), -1)}
											>
												↑
											</Button>
											<Button
												size="sm"
												variant="ghost"
												aria-label={m.attachments_move_later()}
												disabled={i() >= files().length - 1}
												onClick={() => move(i(), 1)}
											>
												↓
											</Button>
											<ConfirmButton
												label={m.attachments_delete()}
												question={m.attachments_delete_question({
													name: name(),
												})}
												destructive
												variant="ghost"
												onConfirm={() => remove(f.id)}
											/>
										</div>
									</Show>
								</li>
							)
						}}
					</For>
				</ul>
			</Show>
		</div>
	)
}
