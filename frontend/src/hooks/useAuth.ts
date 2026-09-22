import { createSignal, onMount } from 'solid-js'
import { type AuthUser, api, apiPublic, getToken, setToken } from '../api'

/**
 * Login / setup / session state.
 * Data refresh after login/setup is orchestrated by the caller, which owns
 * the resource refetch functions.
 */
export function useAuth() {
	const [authUser, setAuthUser] = createSignal<AuthUser | null>(null)
	const [setupRequired, setSetupRequired] = createSignal(false)
	const [authLoading, setAuthLoading] = createSignal(true)
	const [authError, setAuthError] = createSignal<string | null>(null)
	const [loginUsername, setLoginUsername] = createSignal('')
	const [loginPassword, setLoginPassword] = createSignal('')
	const [loginBusy, setLoginBusy] = createSignal(false)
	const [setupUsername, setSetupUsername] = createSignal('')
	const [setupDisplayName, setSetupDisplayName] = createSignal('')
	const [setupPassword, setSetupPassword] = createSignal('')
	const [setupBusy, setSetupBusy] = createSignal(false)

	async function refreshAuthStatus(): Promise<void> {
		setAuthLoading(true)
		try {
			const token = getToken()
			const headers: Record<string, string> = { 'content-type': 'application/json' }
			if (token) headers.authorization = `Bearer ${token}`
			const res = await fetch('/api/auth/status', { headers })
			const data = (await res.json()) as { setupRequired: boolean; user: AuthUser | null }
			setSetupRequired(data.setupRequired)
			setAuthUser(data.user)
			if (!data.user) setToken(null)
		} catch {
			setAuthError('Could not reach the server.')
		} finally {
			setAuthLoading(false)
		}
	}

	onMount(() => {
		void refreshAuthStatus()
	})

	/** Returns the logged-in user, or null on validation failure / error. */
	async function login(e: Event): Promise<AuthUser | null> {
		e.preventDefault()
		setAuthError(null)
		if (!loginUsername().trim() || !loginPassword()) {
			setAuthError('Username and password are required.')
			return null
		}
		setLoginBusy(true)
		try {
			const data = await apiPublic<{ user: AuthUser; token: string }>('/auth/login', {
				method: 'POST',
				body: JSON.stringify({ username: loginUsername().trim(), password: loginPassword() }),
			})
			setToken(data.token)
			setAuthUser(data.user)
			setSetupRequired(false)
			setLoginPassword('')
			return data.user
		} catch (err) {
			setAuthError(err instanceof Error ? err.message : 'Login failed.')
			return null
		} finally {
			setLoginBusy(false)
		}
	}

	/** Returns the created admin user, or null on validation failure / error. */
	async function setup(e: Event): Promise<AuthUser | null> {
		e.preventDefault()
		setAuthError(null)
		if (!setupUsername().trim() || !setupPassword()) {
			setAuthError('Username and password are required.')
			return null
		}
		setSetupBusy(true)
		try {
			const data = await apiPublic<{ user: AuthUser; token: string }>('/auth/setup', {
				method: 'POST',
				body: JSON.stringify({
					username: setupUsername().trim(),
					displayName: setupDisplayName().trim() || undefined,
					password: setupPassword(),
				}),
			})
			setToken(data.token)
			setAuthUser(data.user)
			setSetupRequired(false)
			setSetupDisplayName('')
			setSetupPassword('')
			return data.user
		} catch (err) {
			setAuthError(err instanceof Error ? err.message : 'Setup failed.')
			return null
		} finally {
			setSetupBusy(false)
		}
	}

	async function logout(): Promise<void> {
		try {
			await api('/auth/logout', { method: 'POST' })
		} catch {
			// Ignore; token is cleared below regardless.
		}
		setToken(null)
		setAuthUser(null)
	}

	return {
		authUser,
		setAuthUser,
		setupRequired,
		authLoading,
		authError,
		loginUsername,
		setLoginUsername,
		loginPassword,
		setLoginPassword,
		loginBusy,
		setupUsername,
		setSetupUsername,
		setupDisplayName,
		setSetupDisplayName,
		setupPassword,
		setSetupPassword,
		setupBusy,
		refreshAuthStatus,
		login,
		setup,
		logout,
	}
}

export type AuthStore = ReturnType<typeof useAuth>
