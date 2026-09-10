import { createSignal } from 'solid-js'
import { safeStorage } from './storage'

export type Theme = 'light' | 'dark'

function isTheme(value: unknown): value is Theme {
	return value === 'dark' || value === 'light'
}

function prefersDark(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-color-scheme: dark)').matches
	)
}

function getInitialTheme(): Theme {
	const attr = typeof document === 'undefined' ? null : document.documentElement.dataset.theme
	const stored = safeStorage.get('theme')
	return (
		(isTheme(attr) ? attr : null) ??
		(isTheme(stored) ? stored : null) ??
		(prefersDark() ? 'dark' : null) ??
		'light'
	)
}

const [theme, setThemeSignal] = createSignal<Theme>(getInitialTheme())

function applyTheme(next: Theme) {
	if (typeof document !== 'undefined') {
		document.documentElement.dataset.theme = next
		document.documentElement.style.colorScheme = next
	}
	safeStorage.set('theme', next)
}

/** Sync the DOM with the current theme. Call once from index.tsx. */
export function initTheme() {
	applyTheme(theme())
}

export { theme }

export function setTheme(next: Theme) {
	applyTheme(next)
	setThemeSignal(next)
}

export function toggleTheme() {
	setTheme(theme() === 'dark' ? 'light' : 'dark')
}

export function initThemeListener() {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return () => {}
	}
	const mq = window.matchMedia('(prefers-color-scheme: dark)')
	const handler = (e: MediaQueryListEvent) => {
		// Only follow system when user has no explicit choice stored
		if (safeStorage.get('theme') == null) {
			setTheme(e.matches ? 'dark' : 'light')
		}
	}
	mq.addEventListener('change', handler)
	return () => mq.removeEventListener('change', handler)
}
