import { IconEdit, IconLoader2, IconTrash, IconX } from '@tabler/icons-solidjs'
import { For, Show } from 'solid-js'
import { ClearableInput } from '../components/ClearableInput'
import { t } from '../i18n'
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
					<h2>
						{t('nav.users')} ({props.users.length})
					</h2>
				</div>
			</section>
			<Show when={props.userError}>
				<p class="error">{props.userError}</p>
			</Show>
			<section class="panel catalog-section">
				<h3>{t('users.create')}</h3>
				<form onSubmit={props.onCreateUser}>
					<div class="form-grid user-create-grid">
						<label for="new-user-username">
							<span>
								{t('auth.username')} <em>*</em>
							</span>
							<ClearableInput
								id="new-user-username"
								value={props.newUsername}
								onInput={(e) => props.onNewUsername(e.currentTarget.value)}
								required
								autocomplete="off"
							/>
						</label>
						<label for="new-user-display-name">
							<span>{t('auth.displayNameOptional')}</span>
							<ClearableInput
								id="new-user-display-name"
								value={props.newDisplayName}
								onInput={(e) => props.onNewDisplayName(e.currentTarget.value)}
								autocomplete="off"
								placeholder={t('auth.displayNamePlaceholder')}
							/>
						</label>
						<label for="new-user-password">
							<span>
								{t('auth.password')} <em>*</em>
							</span>
							<ClearableInput
								id="new-user-password"
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
								<span>{t('users.adminCheckbox')}</span>
							</span>
						</label>
					</div>
					<div class="form-actions">
						<button type="submit" class="primary" disabled={props.userSaving}>
							{props.userSaving ? t('common.creating') : t('users.create')}
						</button>
					</div>
				</form>
			</section>
			<section class="panel catalog-section">
				<h3>{t('users.all')}</h3>
				<Show
					when={!props.usersLoading && props.users.length > 0}
					fallback={<p class="muted small">{t('users.empty')}</p>}
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
											<span class="muted small">{t('users.adminBadge')}</span>
										</Show>
										<Show when={u.id === props.currentUserId}>
											<span class="muted small"> {t('users.youBadge')}</span>
										</Show>
									</span>
									<span class="manage-actions">
										<button
											type="button"
											class="ghost small-btn"
											onClick={() => props.onStartEditUser(u)}
											aria-label={t('library.editAria', { title: u.username })}
										>
											<IconEdit size={14} /> {t('common.edit')}
										</button>
										<Show
											when={u.id !== props.currentUserId}
											fallback={<span class="muted small">{t('users.current')}</span>}
										>
											<button
												type="button"
												class="danger-ghost"
												onClick={() => props.onRemoveUser(u.id, u.username)}
												aria-label={t('common.delete', { name: u.username })}
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
						<h2 id="edit-user-title">{t('users.editTitle')}</h2>
					</div>
					<button
						type="button"
						class="clear"
						onClick={props.onClose}
						aria-label={t('users.editClose')}
					>
						<IconX size={18} />
					</button>
				</div>
				<form onSubmit={props.onSubmit}>
					<div class="form-grid">
						<label for="edit-user-username">
							<span>
								{t('auth.username')} <em>*</em>
							</span>
							<ClearableInput
								id="edit-user-username"
								value={props.username}
								onInput={(e) => props.onUsername(e.currentTarget.value)}
								required
								autocomplete="off"
							/>
						</label>
						<label for="edit-user-display-name">
							<span>{t('users.displayNameEdit')}</span>
							<ClearableInput
								id="edit-user-display-name"
								value={props.displayName}
								onInput={(e) => props.onDisplayName(e.currentTarget.value)}
								autocomplete="off"
								placeholder={t('auth.displayNamePlaceholder')}
							/>
						</label>
						<label for="edit-user-password">
							<span>{t('users.newPassword')}</span>
							<ClearableInput
								id="edit-user-password"
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
							<span>{t('users.adminCheckbox')}</span>
						</label>
					</div>
					<Show when={props.error}>
						<p class="error">{props.error}</p>
					</Show>
					<div class="form-actions">
						<button type="button" class="ghost" onClick={props.onClose}>
							{t('common.cancel')}
						</button>
						<button type="submit" class="primary" disabled={props.saving}>
							<Show when={props.saving} fallback={<IconEdit size={16} />}>
								<IconLoader2 size={16} class="spin" />
							</Show>
							{props.saving ? t('common.saving') : t('common.saveChanges')}
						</button>
					</div>
				</form>
			</section>
		</div>
	)
}
