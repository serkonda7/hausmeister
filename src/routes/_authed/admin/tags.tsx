import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { createSignal, For, Show } from 'solid-js'
import { ConfirmButton } from '~/components/confirm-dialog'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Input, inputClass } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { showToast } from '~/components/ui/toast'
import { adminTagsQuery } from '~/lib/admin-queries'
import { guardSection } from '~/lib/admin-sections'
import { cn } from '~/lib/cn'
import { goToLogin, isSignedOutError } from '~/lib/error-text'
import { TAG_NAME_MAX } from '~/lib/items/constants'
import { itemsErrorText } from '~/lib/items/errors'
import type { TagSummary } from '~/lib/items/types'
import { m } from '~/paraglide/messages'
import { deleteTagFn, mergeTagsFn, recolorTagFn, renameTagFn } from '~/server/tags/functions'

export const Route = createFileRoute('/_authed/admin/tags')({
	beforeLoad: ({ context }) => guardSection(context.user.role, '/admin/tags'),
	loader: ({ context }) => context.queryClient.ensureQueryData(adminTagsQuery()),
	head: () => ({ meta: [{ title: `${m.admin_nav_tags()} · ${m.app_name()}` }] }),
	component: TagsPage,
})

/** Like runAction, but maps the tag error codes to their German text. */
async function runItemsAction<T>(
	fn: () => Promise<T>,
	opts: { success?: string | ((r: T) => string) } = {},
): Promise<T | undefined> {
	try {
		const r = await fn()
		const text = typeof opts.success === 'function' ? opts.success(r) : opts.success
		if (text) showToast({ title: text, variant: 'success' })
		return r
	} catch (err) {
		if (isSignedOutError(err)) {
			goToLogin()
			return undefined
		}
		showToast({ title: itemsErrorText(err), variant: 'error' })
		return undefined
	}
}

// The server accepts #RRGGBB or null; this palette only drives the choices.
const PALETTE = [
	{ value: '#e11d48', label: m.admin_tags_color_red },
	{ value: '#ea580c', label: m.admin_tags_color_orange },
	{ value: '#ca8a04', label: m.admin_tags_color_yellow },
	{ value: '#16a34a', label: m.admin_tags_color_green },
	{ value: '#0d9488', label: m.admin_tags_color_teal },
	{ value: '#2563eb', label: m.admin_tags_color_blue },
	{ value: '#9333ea', label: m.admin_tags_color_purple },
	{ value: '#db2777', label: m.admin_tags_color_pink },
] as const

function TagsPage() {
	const qc = useQueryClient()
	const tags = useQuery(() => adminTagsQuery())
	const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })

	return (
		<div class="grid gap-4">
			<Card>
				<CardHeader>
					<CardTitle>
						<h2>{m.admin_nav_tags()}</h2>
					</CardTitle>
					<CardDescription>{m.admin_tags_intro()}</CardDescription>
				</CardHeader>
			</Card>
			<Show
				when={(tags.data ?? []).length > 0}
				fallback={<p class="text-sm text-muted-foreground">{m.admin_tags_empty()}</p>}
			>
				<ul class="grid gap-3" aria-label={m.admin_nav_tags()}>
					<For each={tags.data}>
						{(tag) => <TagCard tag={tag} allTags={tags.data ?? []} refresh={refresh} />}
					</For>
				</ul>
			</Show>
		</div>
	)
}

function TagCard(props: { tag: TagSummary; allTags: TagSummary[]; refresh: () => Promise<void> }) {
	const [renaming, setRenaming] = createSignal(false)
	const [colorOpen, setColorOpen] = createSignal(false)
	const [mergeOpen, setMergeOpen] = createSignal(false)
	const [target, setTarget] = createSignal('')
	const tag = () => props.tag
	const targets = () => props.allTags.filter((t) => t.id !== tag().id)

	async function onRename(e: SubmitEvent) {
		e.preventDefault()
		const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name') ?? '')
		const r = await runItemsAction(() => renameTagFn({ data: { id: tag().id, name } }), {
			success: m.admin_tags_renamed(),
		})
		if (r) {
			setRenaming(false)
			await props.refresh()
		}
	}

	async function onRecolor(color: string | null) {
		const r = await runItemsAction(() => recolorTagFn({ data: { id: tag().id, color } }), {
			success: m.admin_tags_recolored(),
		})
		if (r) {
			setColorOpen(false)
			await props.refresh()
		}
	}

	async function onMerge() {
		const targetId = target()
		if (!targetId) return
		const r = await runItemsAction(
			() => mergeTagsFn({ data: { sourceId: tag().id, targetId } }),
			{
				success: (res) => m.admin_tags_merged({ count: res.items }),
			},
		)
		if (r) {
			setMergeOpen(false)
			setTarget('')
			await props.refresh()
		}
	}

	return (
		<li>
			<Card aria-label={tag().name}>
				<CardContent class="grid gap-3 pt-4">
					<div class="flex flex-wrap items-center gap-2">
						<span
							class={cn(
								'size-4 shrink-0 rounded-full border border-foreground/40',
								!tag().color && 'border-dashed',
							)}
							style={{ 'background-color': tag().color ?? 'transparent' }}
							aria-hidden="true"
						/>
						<h3 class="mr-auto text-lg font-semibold">{tag().name}</h3>
						<span class="text-sm text-muted-foreground">
							{m.admin_tags_count({ count: tag().count })}
						</span>
					</div>

					<Show
						when={renaming()}
						fallback={
							<div class="flex flex-wrap gap-2">
								<Button variant="outline" onClick={() => setRenaming(true)}>
									{m.admin_tags_rename()}
								</Button>
								<Button
									variant="outline"
									onClick={() => setColorOpen(!colorOpen())}
								>
									{m.admin_tags_recolor()}
								</Button>
								<Button
									variant="outline"
									disabled={targets().length === 0}
									onClick={() => {
										setTarget('')
										setMergeOpen(true)
									}}
								>
									{m.admin_tags_merge()}
								</Button>
								<ConfirmButton
									label={m.admin_tags_delete()}
									question={m.admin_tags_delete_confirm({
										name: tag().name,
										count: tag().count,
									})}
									destructive
									size="default"
									onConfirm={async () => {
										await runItemsAction(
											() => deleteTagFn({ data: { id: tag().id } }),
											{
												success: (res) =>
													m.admin_tags_deleted({ count: res.items }),
											},
										)
										await props.refresh()
									}}
								/>
							</div>
						}
					>
						<form class="flex flex-wrap gap-2" onSubmit={onRename}>
							<Input
								name="name"
								value={tag().name}
								aria-label={m.admin_tags_name()}
								maxLength={TAG_NAME_MAX}
								class="min-w-0 flex-1"
								required
							/>
							<Button type="submit">{m.common_save()}</Button>
							<Button variant="ghost" onClick={() => setRenaming(false)}>
								{m.common_cancel()}
							</Button>
						</form>
					</Show>

					<Show when={colorOpen()}>
						<div class="grid gap-2 rounded-md border p-3">
							<p class="text-sm font-medium">{m.admin_tags_color()}</p>
							<div class="flex flex-wrap gap-2">
								<For each={PALETTE}>
									{(c) => (
										<Button
											variant="outline"
											size="icon"
											class={cn(
												'rounded-full border-foreground/40',
												tag().color === c.value &&
													'ring-2 ring-ring ring-offset-2',
											)}
											style={{ 'background-color': c.value }}
											aria-label={c.label()}
											title={c.label()}
											aria-pressed={tag().color === c.value}
											onClick={() => onRecolor(c.value)}
										/>
									)}
								</For>
								<Button
									variant="outline"
									aria-label={m.admin_tags_color_none()}
									onClick={() => onRecolor(null)}
								>
									{m.admin_tags_color_none()}
								</Button>
							</div>
						</div>
					</Show>

					<Dialog open={mergeOpen()} onOpenChange={setMergeOpen}>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>
									{m.admin_tags_merge_title({ name: tag().name })}
								</DialogTitle>
								<DialogDescription>
									{m.admin_tags_merge_explain()}
								</DialogDescription>
							</DialogHeader>
							<div class="grid gap-2">
								<Label for={`merge-target-${tag().id}`}>
									{m.admin_tags_merge_target()}
								</Label>
								<select
									id={`merge-target-${tag().id}`}
									class={inputClass}
									value={target()}
									onChange={(e) => setTarget(e.currentTarget.value)}
								>
									<option value="">{m.admin_tags_merge_placeholder()}</option>
									<For each={targets()}>
										{(t) => <option value={t.id}>{t.name}</option>}
									</For>
								</select>
							</div>
							<DialogFooter>
								<Button variant="outline" onClick={() => setMergeOpen(false)}>
									{m.common_cancel()}
								</Button>
								<Button disabled={!target()} onClick={onMerge}>
									{m.admin_tags_merge()}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</CardContent>
			</Card>
		</li>
	)
}
