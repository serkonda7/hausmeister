import { type Accessor, createSignal } from 'solid-js'
import { api } from '../api'
import { t } from '../i18n'
import type { AppUser, ManagedUser } from '../types'

export type UserManagementDeps = {
	authUser: Accessor<AppUser | null>
	setAuthUser: (u: AppUser | null) => void
	refetchUsers: () => unknown
	refetchBooks: () => unknown
}

/** Admin user management: create / delete / edit dialog state and handlers. */
export function useUserManagement(deps: UserManagementDeps) {
	const [newUsername, setNewUsername] = createSignal('')
	const [newDisplayName, setNewDisplayName] = createSignal('')
	const [newPassword, setNewPassword] = createSignal('')
	const [newIsAdmin, setNewIsAdmin] = createSignal(false)
	const [userError, setUserError] = createSignal<string | null>(null)
	const [userSaving, setUserSaving] = createSignal(false)
	// Edit user (admin only): rename, display name, reset password, toggle admin flag.
	const [editingUser, setEditingUser] = createSignal<ManagedUser | null>(null)
	const [editUsername, setEditUsername] = createSignal('')
	const [editDisplayName, setEditDisplayName] = createSignal('')
	const [editPassword, setEditPassword] = createSignal('')
	const [editIsAdmin, setEditIsAdmin] = createSignal(false)
	const [editUserSaving, setEditUserSaving] = createSignal(false)
	const [editUserError, setEditUserError] = createSignal<string | null>(null)

	async function createUser(e: Event): Promise<void> {
		e.preventDefault()
		setUserError(null)
		if (!newUsername().trim() || !newPassword()) {
			setUserError(t('auth.credentialsRequired'))
			return
		}
		setUserSaving(true)
		try {
			await api('/users', {
				method: 'POST',
				body: JSON.stringify({
					username: newUsername().trim(),
					displayName: newDisplayName().trim() || undefined,
					password: newPassword(),
					isAdmin: newIsAdmin(),
				}),
			})
			setNewUsername('')
			setNewDisplayName('')
			setNewPassword('')
			setNewIsAdmin(false)
			await deps.refetchUsers()
		} catch (err) {
			setUserError(err instanceof Error ? err.message : t('users.createFailed'))
		} finally {
			setUserSaving(false)
		}
	}

	async function removeUser(id: string, username: string): Promise<void> {
		if (!window.confirm(t('users.confirmDelete', { name: username }))) return
		setUserError(null)
		try {
			await api(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
			await Promise.all([deps.refetchUsers(), deps.refetchBooks()])
		} catch (err) {
			setUserError(err instanceof Error ? err.message : t('users.deleteFailed'))
		}
	}

	function startEditUser(u: ManagedUser): void {
		setEditingUser(u)
		setEditUsername(u.username)
		setEditDisplayName(u.displayName ?? '')
		setEditPassword('')
		setEditIsAdmin(u.isAdmin)
		setEditUserError(null)
	}

	function closeEditUser(): void {
		if (editUserSaving()) return
		setEditingUser(null)
		setEditUserError(null)
		setEditUsername('')
		setEditDisplayName('')
		setEditPassword('')
		setEditIsAdmin(false)
	}

	function isEditUserDirty(): boolean {
		const target = editingUser()
		if (!target) return false
		if (editUsername().trim() !== target.username) return true
		if ((editDisplayName().trim() || null) !== (target.displayName ?? null)) return true
		if (editPassword() !== '') return true
		if (editIsAdmin() !== target.isAdmin) return true
		return false
	}

	function requestCloseEditUser(): void {
		// Only used for backdrop clicks: Cancel / ✕ / Escape close unconditionally.
		if (editUserSaving()) return
		if (isEditUserDirty() && !window.confirm(t('common.discardChanges'))) return
		closeEditUser()
	}

	async function saveEditUser(e: Event): Promise<void> {
		e.preventDefault()
		const target = editingUser()
		if (!target) return
		setEditUserError(null)
		const username = editUsername().trim()
		if (!username) {
			setEditUserError(t('users.usernameRequired'))
			return
		}
		setEditUserSaving(true)
		try {
			const payload: Record<string, unknown> = {}
			if (username !== target.username) payload.username = username
			const displayName = editDisplayName().trim() || null
			if (displayName !== (target.displayName ?? null)) payload.displayName = displayName
			if (editPassword()) payload.password = editPassword()
			if (editIsAdmin() !== target.isAdmin) payload.isAdmin = editIsAdmin()
			if (Object.keys(payload).length === 0) {
				setEditUserSaving(false)
				closeEditUser()
				return
			}
			const data = await api<{ user: ManagedUser }>(`/users/${encodeURIComponent(target.id)}`, {
				method: 'PATCH',
				body: JSON.stringify(payload),
			})
			if (data.user.id === deps.authUser()?.id) {
				deps.setAuthUser(data.user)
			}
			closeEditUser()
			await Promise.all([deps.refetchUsers(), deps.refetchBooks()])
		} catch (err) {
			setEditUserError(err instanceof Error ? err.message : t('users.updateFailed'))
		} finally {
			setEditUserSaving(false)
		}
	}

	return {
		newUsername,
		setNewUsername,
		newDisplayName,
		setNewDisplayName,
		newPassword,
		setNewPassword,
		newIsAdmin,
		setNewIsAdmin,
		userError,
		userSaving,
		editingUser,
		editUsername,
		setEditUsername,
		editDisplayName,
		setEditDisplayName,
		editPassword,
		setEditPassword,
		editIsAdmin,
		setEditIsAdmin,
		editUserSaving,
		editUserError,
		createUser,
		removeUser,
		startEditUser,
		closeEditUser,
		requestCloseEditUser,
		saveEditUser,
	}
}

export type UserManagementStore = ReturnType<typeof useUserManagement>
