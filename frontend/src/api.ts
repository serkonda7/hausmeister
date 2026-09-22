export const API_BASE = ''

const TOKEN_KEY = 'hausmeister_token'

export function getToken(): string | null {
	try {
		return localStorage.getItem(TOKEN_KEY)
	} catch {
		return null
	}
}

export function setToken(token: string | null): void {
	try {
		if (token) {
			localStorage.setItem(TOKEN_KEY, token)
		} else {
			localStorage.removeItem(TOKEN_KEY)
		}
	} catch {
		// Storage unavailable (private mode); requests will just be unauthorized.
	}
}

export type AuthUser = {
	id: string
	username: string
	displayName: string | null
	isAdmin: boolean
	createdAt: number
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
	const headers: Record<string, string> = { 'content-type': 'application/json' }
	if (init?.headers) {
		for (const [k, v] of new Headers(init.headers).entries()) {
			headers[k.toLowerCase()] = v
		}
	}
	const token = getToken()
	if (token && !headers.authorization) {
		headers.authorization = `Bearer ${token}`
	}
	const res = await fetch(`${API_BASE}/api${path}`, { ...init, headers })
	if (res.status === 401) {
		setToken(null)
	}
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string }
		throw new Error(body.error ?? `Request failed: ${res.status}`)
	}
	return (await res.json()) as T
}

export async function apiPublic<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}/api${path}`, {
		headers: { 'content-type': 'application/json' },
		...init,
	})
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string }
		throw new Error(body.error ?? `Request failed: ${res.status}`)
	}
	return (await res.json()) as T
}
