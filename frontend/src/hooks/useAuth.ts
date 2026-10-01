import { createSignal, onMount } from 'solid-js'
import { api, errorMessage, setToken } from '../api'
import { type TranslationKey, t } from '../i18n'
import type { PublicUser } from '../types'

export type Credentials = { username: string; password: string; displayName?: string }

/** Session state: first-run setup, login and logout. */
export function useAuth() {
	const [user, setUser] = createSignal<PublicUser | null>(null)
	const [setupRequired, setSetupRequired] = createSignal(false)
	const [loading, setLoading] = createSignal(true)
	const [busy, setBusy] = createSignal(false)
	const [error, setError] = createSignal<string | null>(null)

	onMount(async () => {
		try {
			const data = await api<{ setupRequired: boolean; user: PublicUser | null }>('/auth/status')
			setSetupRequired(data.setupRequired)
			setUser(data.user)
			if (!data.user) setToken(null)
		} catch {
			setError(t('common.serverUnreachable'))
		} finally {
			setLoading(false)
		}
	})

	async function authenticate(
		path: string,
		credentials: Credentials,
		fallback: TranslationKey,
	): Promise<void> {
		setError(null)
		const username = credentials.username.trim()
		if (!username || !credentials.password) {
			setError(t('auth.credentialsRequired'))
			return
		}
		setBusy(true)
		try {
			const body = {
				username,
				password: credentials.password,
				displayName: credentials.displayName?.trim() || undefined,
			}
			const data = await api<{ user: PublicUser; token: string }>(path, { method: 'POST', body })
			setToken(data.token)
			setSetupRequired(false)
			setUser(data.user)
		} catch (err) {
			setError(errorMessage(err, fallback))
		} finally {
			setBusy(false)
		}
	}

	async function logout(): Promise<void> {
		// Best effort: the token is dropped locally either way.
		await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
		setToken(null)
		setUser(null)
	}

	return {
		user,
		setUser,
		setupRequired,
		loading,
		busy,
		error,
		login: (credentials: Credentials) =>
			authenticate('/auth/login', credentials, 'auth.loginFailed'),
		setup: (credentials: Credentials) =>
			authenticate('/auth/setup', credentials, 'auth.setupFailed'),
		logout,
	}
}
