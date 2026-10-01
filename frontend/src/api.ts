import { type TranslationKey, t } from './i18n'
import { loadStored, store } from './utils/storage'

const TOKEN_KEY = 'hausmeister_token'

export function setToken(token: string | null): void {
	store(TOKEN_KEY, token)
}

export type ApiInit = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown }

/** Call `/api{path}` with the session token; throws the server's error message on failure. */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
	const headers: Record<string, string> = { 'content-type': 'application/json' }
	const token = loadStored(TOKEN_KEY)
	if (token) headers.authorization = `Bearer ${token}`
	const res = await fetch(`/api${path}`, {
		method: init.method,
		headers,
		body: init.body === undefined ? undefined : JSON.stringify(init.body),
	})
	if (res.status === 401) setToken(null)
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string }
		throw new Error(body.error ?? t('common.requestFailed', { status: res.status }))
	}
	return (await res.json()) as T
}

export function errorMessage(err: unknown, fallback: TranslationKey): string {
	return err instanceof Error ? err.message : t(fallback)
}
