import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import { createSignal, For, Show } from 'solid-js'
import { ConfirmButton } from '~/components/confirm-dialog'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Input, inputClass } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { adminGroupsQuery, adminUserOptionsQuery } from '~/lib/admin-queries'
import { guardSection } from '~/lib/admin-sections'
import { cn } from '~/lib/cn'
import { runAction } from '~/lib/run-action'
import { m } from '~/paraglide/messages'
import {
	adminAddGroupMember,
	adminCreateGroup,
	adminDeleteGroup,
	adminRemoveGroupMember,
	adminRenameGroup,
} from '~/server/admin/functions'
import type { AdminGroupRow } from '~/server/admin/groups'

export const Route = createFileRoute('/_authed/admin/groups')({
	beforeLoad: ({ context }) => guardSection(context.user.role, '/admin/groups'),
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(adminGroupsQuery()),
			context.queryClient.ensureQueryData(adminUserOptionsQuery()),
		]),
	head: () => ({ meta: [{ title: `${m.admin_nav_groups()} · ${m.app_name()}` }] }),
	component: GroupsPage,
})

const ok = async (p: Promise<unknown>) => {
	await p
	return true
}

function GroupsPage() {
	const qc = useQueryClient()
	const groups = useQuery(() => adminGroupsQuery())
	const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] })

	async function onCreate(e: SubmitEvent) {
		e.preventDefault()
		const formEl = e.currentTarget as HTMLFormElement
		const name = String(new FormData(formEl).get('name') ?? '')
		const r = await runAction(() => adminCreateGroup({ data: { name } }), {
			success: (g) => m.admin_groups_created({ name: g.name }),
		})
		if (r) {
			formEl.reset()
			await refresh()
		}
	}

	return (
		<div class="grid gap-4">
			<Card>
				<CardHeader>
					<CardTitle>
						<h2>{m.admin_groups_create()}</h2>
					</CardTitle>
					<CardDescription>{m.admin_groups_intro()}</CardDescription>
				</CardHeader>
				<CardContent>
					<form class="flex flex-wrap items-end gap-2" onSubmit={onCreate}>
						<div class="grid flex-1 gap-2">
							<Label for="group-name">{m.admin_groups_new_name()}</Label>
							<Input id="group-name" name="name" maxLength={60} required />
						</div>
						<Button type="submit">{m.admin_groups_create()}</Button>
					</form>
				</CardContent>
			</Card>
			<Show
				when={(groups.data ?? []).length > 0}
				fallback={<p class="text-sm text-muted-foreground">{m.admin_groups_empty()}</p>}
			>
				<ul class="grid gap-3" aria-label={m.admin_nav_groups()}>
					<For each={groups.data}>{(g) => <GroupCard group={g} refresh={refresh} />}</For>
				</ul>
			</Show>
		</div>
	)
}

function GroupCard(props: { group: AdminGroupRow; refresh: () => Promise<void> }) {
	const users = useQuery(() => adminUserOptionsQuery())
	const [renaming, setRenaming] = createSignal(false)
	const g = () => props.group
	const candidates = () =>
		(users.data ?? []).filter((u) => !g().members.some((mem) => mem.id === u.id))

	async function onRename(e: SubmitEvent) {
		e.preventDefault()
		const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name') ?? '')
		const r = await runAction(() => ok(adminRenameGroup({ data: { groupId: g().id, name } })), {
			success: m.admin_groups_renamed(),
		})
		if (r) {
			setRenaming(false)
			await props.refresh()
		}
	}

	async function onAdd(e: SubmitEvent) {
		e.preventDefault()
		const userId = String(new FormData(e.currentTarget as HTMLFormElement).get('userId') ?? '')
		if (!userId) return
		await runAction(() => adminAddGroupMember({ data: { groupId: g().id, userId } }))
		await props.refresh()
	}

	return (
		<li>
			<Card aria-label={g().name}>
				<CardContent class="grid gap-3 pt-4">
					<Show
						when={renaming()}
						fallback={
							<div class="flex flex-wrap items-center gap-2">
								<h3 class="mr-auto text-lg font-semibold">{g().name}</h3>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setRenaming(true)}
								>
									{m.admin_groups_rename()}
								</Button>
								<ConfirmButton
									label={m.admin_groups_delete()}
									question={m.admin_groups_delete_confirm({ name: g().name })}
									destructive
									onConfirm={async () => {
										await runAction(
											() =>
												ok(adminDeleteGroup({ data: { groupId: g().id } })),
											{
												success: m.admin_groups_deleted(),
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
								value={g().name}
								aria-label={m.admin_groups_name()}
								maxLength={60}
								class="flex-1"
								required
							/>
							<Button type="submit" size="sm">
								{m.common_save()}
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
								{m.common_cancel()}
							</Button>
						</form>
					</Show>
					<Show when={g().ownedItems > 0}>
						<p class="text-sm text-muted-foreground">
							{m.admin_groups_owned_items({ count: g().ownedItems })}
						</p>
					</Show>
					<div class="grid gap-2">
						<h4 class="text-sm font-medium">{m.admin_groups_members()}</h4>
						<Show
							when={g().members.length > 0}
							fallback={
								<p class="text-sm text-muted-foreground">
									{m.admin_groups_no_members()}
								</p>
							}
						>
							<ul class="flex flex-wrap gap-2">
								<For each={g().members}>
									{(mem) => (
										<li class="inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm">
											{mem.displayName}
											<button
												type="button"
												class="flex size-7 items-center justify-center rounded-full hover:bg-accent"
												aria-label={m.admin_groups_remove_member({
													name: mem.displayName,
													group: g().name,
												})}
												onClick={async () => {
													await runAction(() =>
														adminRemoveGroupMember({
															data: {
																groupId: g().id,
																userId: mem.id,
															},
														}),
													)
													await props.refresh()
												}}
											>
												✕
											</button>
										</li>
									)}
								</For>
							</ul>
						</Show>
						<Show when={candidates().length > 0}>
							<form class="flex flex-wrap gap-2" onSubmit={onAdd}>
								<select
									name="userId"
									class={cn(inputClass, 'h-9 flex-1')}
									aria-label={m.admin_groups_pick_user({ group: g().name })}
									required
								>
									<option value="">{m.admin_groups_pick_placeholder()}</option>
									<For each={candidates()}>
										{(u) => (
											<option value={u.id}>
												{u.displayName} (@{u.username})
											</option>
										)}
									</For>
								</select>
								<Button type="submit" size="sm" variant="outline">
									{m.admin_groups_add_member()}
								</Button>
							</form>
						</Show>
					</div>
				</CardContent>
			</Card>
		</li>
	)
}
