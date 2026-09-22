import { IconEdit, IconLoader2, IconTrash, IconX } from '@tabler/icons-solidjs'
import { For, Show } from 'solid-js'
import type { ManagedUser } from '../types'
import { userDisplayName } from '../utils/books'

export type UsersPageProps = {
	users: ManagedUser[]
	usersLoading: boolean
	currentUserId: string | null
	userError: string | null
	newUsername: string
	onNewUsername: (v: string) => void
	newDisplayName: string
	onNewDisplayName: (v: string) => void
	newPassword: string
	onNewPassword: (v: string) => void
	newIsAdmin: boolean
	onNewIsAdmin: (v: boolean) => void
	userSaving: boolean
	onCreateUser: (e: Event) => void
	onRemoveUser: (id: string, username: string) => void
	onStartEditUser: (u: ManagedUser) => void
}

export function UsersPage(props: UsersPageProps) {
	return (
		<>
			<section class="library-head">
				<div>
					<h2>Users ({props.users.length})</h2>
				</div>
			</section>
			<Show when={props.userError}>
				<p class="error">{props.userError}</p>
			</Show>
			<section class="panel catalog-section">
				<h3>Create user</h3>
				<form onSubmit={props.onCreateUser}>
					<div class="form-grid user-create-grid">
						<label>
							<span>
								Username <em>*</em>
							</span>
							<input
								value={props.newUsername}
								onInput={(e) => props.onNewUsername(e.currentTarget.value)}
								required
								autocomplete="off"
							/>
						</label>
						<label>
							<span>Display name (optional)</span>
							<input
								value={props.newDisplayName}
								onInput={(e) => props.onNewDisplayName(e.currentTarget.value)}
								autocomplete="off"
								placeholder="e.g. Alex"
							/>
						</label>
						<label>
							<span>
								Password <em>*</em>
							</span>
							<input
								type="password"
								value={props.newPassword}
								onInput={(e) => props.onNewPassword(e.currentTarget.value)}
								required
								autocomplete="new-password"
							/>
						</label>
						<label class="check-item span-2">
							<span class="user-admin-toggle">
								<input
									type="checkbox"
									checked={props.newIsAdmin}
									onChange={(e) => props.onNewIsAdmin(e.currentTarget.checked)}
								/>
								<span>Admin (can manage users and all books)</span>
							</span>
						</label>
					</div>
					<div class="form-actions">
						<button type="submit" class="primary" disabled={props.userSaving}>
							{props.userSaving ? 'Creating…' : 'Create user'}
						</button>
					</div>
				</form>
			</section>
			<section class="panel catalog-section">
				<h3>All users</h3>
				<Show
					when={!props.usersLoading && props.users.length > 0}
					fallback={<p class="muted small">No users yet.</p>}
				>
					<ul class="manage-list">
						<For each={props.users}>
							{(u) => (
								<li class="manage-row">
									<span>
										{userDisplayName(u)}{' '}
										<Show when={u.displayName}>
											<span class="muted small">({u.username}) </span>
										</Show>
										<Show when={u.isAdmin}>
											<span class="muted small">· admin</span>
										</Show>
										<Show when={u.id === props.currentUserId}>
											<span class="muted small"> · you</span>
										</Show>
									</span>
									<span class="manage-actions">
										<button
											type="button"
											class="ghost small-btn"
											onClick={() => props.onStartEditUser(u)}
											aria-label={`Edit ${u.username}`}
										>
											<IconEdit size={14} /> Edit
										</button>
										<Show
											when={u.id !== props.currentUserId}
											fallback={<span class="muted small">current</span>}
										>
											<button
												type="button"
												class="danger-ghost"
												onClick={() => props.onRemoveUser(u.id, u.username)}
												aria-label={`Delete ${u.username}`}
											>
												<IconTrash size={14} />
											</button>
										</Show>
									</span>
								</li>
							)}
						</For>
					</ul>
				</Show>
			</section>
		</>
	)
}

export type EditUserDialogProps = {
	user: ManagedUser
	username: string
	onUsername: (v: string) => void
	displayName: string
	onDisplayName: (v: string) => void
	password: string
	onPassword: (v: string) => void
	isAdmin: boolean
	onIsAdmin: (v: boolean) => void
	saving: boolean
	error: string | null
	onSubmit: (e: Event) => void
	onClose: () => void
	onBackdropClose: () => void
}

export function EditUserDialog(props: EditUserDialogProps) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: dialog backdrop dismisses on mouse click; keyboard users have Cancel and Escape.
		<div
			class="dialog-backdrop"
			role="presentation"
			onClick={(e) => {
				if (e.target === e.currentTarget) props.onBackdropClose()
			}}
		>
			<section
				class="dialog panel"
				role="dialog"
				aria-modal="true"
				aria-labelledby="edit-user-title"
			>
				<div class="dialog-heading">
					<div>
						<h2 id="edit-user-title">Edit user</h2>
					</div>
					<button
						type="button"
						class="clear"
						onClick={props.onClose}
						aria-label="Close edit user dialog"
					>
						<IconX size={18} />
					</button>
				</div>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid">
						<label>
							<span>
								Username <em>*</em>
							</span>
							<input
								value={props.username}
								onInput={(e) => props.onUsername(e.currentTarget.value)}
								required
								autocomplete="off"
							/>
						</label>
						<label>
							<span>Display name (empty = username)</span>
							<input
								value={props.displayName}
								onInput={(e) => props.onDisplayName(e.currentTarget.value)}
								autocomplete="off"
								placeholder="e.g. Alex"
							/>
						</label>
						<label>
							<span>New password (empty = keep)</span>
							<input
								type="password"
								value={props.password}
								onInput={(e) => props.onPassword(e.currentTarget.value)}
								autocomplete="new-password"
							/>
						</label>
						<label class="check-item span-2">
							<input
								type="checkbox"
								checked={props.isAdmin}
								onChange={(e) => props.onIsAdmin(e.currentTarget.checked)}
							/>
							<span>Admin (can manage users and all books)</span>
						</label>
					</div>
					<Show when={props.error}>
						<p class="error">{props.error}</p>
					</Show>
					<div class="form-actions">
						<button type="button" class="ghost" onClick={props.onClose}>
							Cancel
						</button>
						<button type="submit" class="primary" disabled={props.saving}>
							<Show when={props.saving} fallback={<IconEdit size={16} />}>
								<IconLoader2 size={16} class="spin" />
							</Show>
							{props.saving ? 'Saving…' : 'Save changes'}
						</button>
					</div>
				</form>
			</section>
		</div>
	)
}
