import { IconEdit, IconTrash } from '@tabler/icons-solidjs'
import { createSignal, For, Show } from 'solid-js'
import { ErrorText, SubmitButton, TextField } from '../components/common'
import { Dialog } from '../components/Dialog'
import type { List } from '../hooks/useCatalog'
import type { UserChanges, UserManagement } from '../hooks/useUserManagement'
import { t } from '../i18n'
import type { PublicUser } from '../types'
import { userDisplayName } from '../utils/books'

export type UsersPageProps = {
	list: List<PublicUser>
	currentUserId: string
	manage: UserManagement
}

export function UsersPage(props: UsersPageProps) {
	return (
		<>
			<section class="library-head">
				<div>
					<h2>
						{t('nav.users')} ({props.list.items().length})
					</h2>
				</div>
			</section>
			<ErrorText message={props.manage.error()} />
			<CreateUserForm manage={props.manage} />
			<section class="panel catalog-section">
				<h3>{t('users.all')}</h3>
				<Show
					when={!props.list.loading() && props.list.items().length > 0}
					fallback={<p class="muted small">{t('users.empty')}</p>}
				>
					<ul class="manage-list">
						<For each={props.list.items()}>{(u) => <UserRow {...props} user={u} />}</For>
					</ul>
				</Show>
			</section>
		</>
	)
}

function CreateUserForm(props: { manage: UserManagement }) {
	const [username, setUsername] = createSignal('')
	const [displayName, setDisplayName] = createSignal('')
	const [password, setPassword] = createSignal('')
	const [isAdmin, setIsAdmin] = createSignal(false)

	async function submit(e: Event): Promise<void> {
		e.preventDefault()
		const data = {
			username: username(),
			displayName: displayName(),
			password: password(),
			isAdmin: isAdmin(),
		}
		if (!(await props.manage.createUser(data))) return
		setUsername('')
		setDisplayName('')
		setPassword('')
		setIsAdmin(false)
	}

	return (
		<section class="panel catalog-section">
			<h3>{t('users.create')}</h3>
			<form onSubmit={submit}>
				<div class="form-grid user-create-grid">
					<TextField
						id="new-user-username"
						label={t('auth.username')}
						value={username()}
						onInput={setUsername}
						required
						autocomplete="off"
					/>
					<TextField
						id="new-user-display-name"
						label={t('auth.displayNameOptional')}
						value={displayName()}
						onInput={setDisplayName}
						autocomplete="off"
						placeholder={t('auth.displayNamePlaceholder')}
					/>
					<TextField
						id="new-user-password"
						label={t('auth.password')}
						type="password"
						value={password()}
						onInput={setPassword}
						required
						autocomplete="new-password"
					/>
					<label class="check-item span-2">
						<span class="user-admin-toggle">
							<input
								type="checkbox"
								checked={isAdmin()}
								onChange={(e) => setIsAdmin(e.currentTarget.checked)}
							/>
							<span>{t('users.adminCheckbox')}</span>
						</span>
					</label>
				</div>
				<div class="form-actions">
					<SubmitButton busy={props.manage.creating()} busyLabel={t('common.creating')}>
						{t('users.create')}
					</SubmitButton>
				</div>
			</form>
		</section>
	)
}

function UserRow(props: UsersPageProps & { user: PublicUser }) {
	const u = () => props.user
	const isMe = () => u().id === props.currentUserId
	return (
		<li class="manage-row">
			<span>
				{userDisplayName(u())}{' '}
				<Show when={u().displayName}>
					<span class="muted small">({u().username}) </span>
				</Show>
				<Show when={u().isAdmin}>
					<span class="muted small">{t('users.adminBadge')}</span>
				</Show>
				<Show when={isMe()}>
					<span class="muted small"> {t('users.youBadge')}</span>
				</Show>
			</span>
			<span class="manage-actions">
				<button
					type="button"
					class="ghost small-btn"
					onClick={() => props.manage.startEditUser(u())}
					aria-label={t('library.editAria', { title: u().username })}
				>
					<IconEdit size={14} /> {t('common.edit')}
				</button>
				<Show when={!isMe()} fallback={<span class="muted small">{t('users.current')}</span>}>
					<button
						type="button"
						class="danger-ghost"
						onClick={() => void props.manage.removeUser(u().id, u().username)}
						aria-label={t('common.delete', { name: u().username })}
					>
						<IconTrash size={14} />
					</button>
				</Show>
			</span>
		</li>
	)
}

export type EditUserDialogProps = {
	user: PublicUser
	manage: UserManagement
}

export function EditUserDialog(props: EditUserDialogProps) {
	// The dialog is keyed on the user, so these start from the user being edited.
	const [username, setUsername] = createSignal(props.user.username)
	const [displayName, setDisplayName] = createSignal(props.user.displayName ?? '')
	const [password, setPassword] = createSignal('')
	const [isAdmin, setIsAdmin] = createSignal(props.user.isAdmin)

	/** Only the fields that differ from the stored user. */
	function changes(): UserChanges {
		const result: UserChanges = {}
		const name = username().trim()
		const display = displayName().trim() || null
		if (name !== props.user.username) result.username = name
		if (display !== props.user.displayName) result.displayName = display
		if (password()) result.password = password()
		if (isAdmin() !== props.user.isAdmin) result.isAdmin = isAdmin()
		return result
	}

	function submit(e: Event): void {
		e.preventDefault()
		void props.manage.saveEditUser(changes())
	}

	return (
		<Dialog
			id="edit-user"
			title={t('users.editTitle')}
			closeLabel={t('users.editClose')}
			onClose={props.manage.closeEditUser}
			isDirty={() => Object.keys(changes()).length > 0}
		>
			<form onSubmit={submit}>
				<div class="form-grid">
					<TextField
						id="edit-user-username"
						label={t('auth.username')}
						value={username()}
						onInput={setUsername}
						required
						autocomplete="off"
					/>
					<TextField
						id="edit-user-display-name"
						label={t('users.displayNameEdit')}
						value={displayName()}
						onInput={setDisplayName}
						autocomplete="off"
						placeholder={t('auth.displayNamePlaceholder')}
					/>
					<TextField
						id="edit-user-password"
						label={t('users.newPassword')}
						type="password"
						value={password()}
						onInput={setPassword}
						autocomplete="new-password"
					/>
					<label class="check-item span-2">
						<input
							type="checkbox"
							checked={isAdmin()}
							onChange={(e) => setIsAdmin(e.currentTarget.checked)}
						/>
						<span>{t('users.adminCheckbox')}</span>
					</label>
				</div>
				<ErrorText message={props.manage.editError()} />
				<div class="form-actions">
					<button type="button" class="ghost" onClick={props.manage.closeEditUser}>
						{t('common.cancel')}
					</button>
					<SubmitButton
						busy={props.manage.editSaving()}
						busyLabel={t('common.saving')}
						icon={<IconEdit size={16} />}
					>
						{t('common.saveChanges')}
					</SubmitButton>
				</div>
			</form>
		</Dialog>
	)
}
