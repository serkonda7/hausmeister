import type { CreateUser } from 'shared/src/book'
import { type Accessor, createSignal } from 'solid-js'
import { api, errorMessage } from '../api'
import { t } from '../i18n'
import type { PublicUser } from '../types'

export type UserChanges = Partial<{
	username: string
	displayName: string | null
	password: string
	isAdmin: boolean
}>

export type UserManagementDeps = {
	user: Accessor<PublicUser | null>
	setUser: (u: PublicUser) => void
	/** Reload users and books (owner names). */
	refresh: () => Promise<unknown>
}

/** Admin user management: create, delete and edit users. */
export function useUserManagement(deps: UserManagementDeps) {
	const [error, setError] = createSignal<string | null>(null)
	const [creating, setCreating] = createSignal(false)
	const [editingUser, setEditingUser] = createSignal<PublicUser | null>(null)
	const [editSaving, setEditSaving] = createSignal(false)
	const [editError, setEditError] = createSignal<string | null>(null)

	async function createUser(data: CreateUser): Promise<boolean> {
		setError(null)
		if (!data.username.trim() || !data.password) {
			setError(t('auth.credentialsRequired'))
			return false
		}
		setCreating(true)
		try {
			const body = {
				...data,
				username: data.username.trim(),
				displayName: data.displayName?.trim() || undefined,
			}
			await api('/users', { method: 'POST', body })
			await deps.refresh()
			return true
		} catch (err) {
			setError(errorMessage(err, 'users.createFailed'))
			return false
		} finally {
			setCreating(false)
		}
	}

	async function removeUser(id: string, username: string): Promise<void> {
		if (!window.confirm(t('users.confirmDelete', { name: username }))) return
		setError(null)
		try {
			await api(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
			await deps.refresh()
		} catch (err) {
			setError(errorMessage(err, 'users.deleteFailed'))
		}
	}

	function startEditUser(u: PublicUser): void {
		setEditError(null)
		setEditingUser(u)
	}

	function closeEditUser(): void {
		if (editSaving()) return
		setEditingUser(null)
	}

	async function saveEditUser(changes: UserChanges): Promise<void> {
		const target = editingUser()
		if (!target) return
		setEditError(null)
		if (changes.username === '') {
			setEditError(t('users.usernameRequired'))
			return
		}
		if (Object.keys(changes).length === 0) {
			closeEditUser()
			return
		}
		setEditSaving(true)
		try {
			const url = `/users/${encodeURIComponent(target.id)}`
			const data = await api<{ user: PublicUser }>(url, { method: 'PATCH', body: changes })
			if (data.user.id === deps.user()?.id) deps.setUser(data.user)
			setEditSaving(false)
			closeEditUser()
			await deps.refresh()
		} catch (err) {
			setEditError(errorMessage(err, 'users.updateFailed'))
		} finally {
			setEditSaving(false)
		}
	}

	return {
		error,
		creating,
		editingUser,
		editSaving,
		editError,
		createUser,
		removeUser,
		startEditUser,
		closeEditUser,
		saveEditUser,
	}
}

export type UserManagement = ReturnType<typeof useUserManagement>
