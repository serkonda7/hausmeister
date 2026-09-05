import { createSignal } from 'solid-js'

export type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
	if (typeof document !== 'undefined') {
		const attr = document.documentElement.dataset.theme
		if (attr === 'dark' || attr === 'light') {
			return attr
		}
	}
	if (typeof localStorage !== 'undefined') {
		const stored = localStorage.getItem('theme')
		if (stored === 'dark' || stored === 'light') {
			return stored
		}
	}
	if (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-color-scheme: dark)').matches
	) {
		return 'dark'
	}
	return 'light'
}

const [theme, setThemeSignal] = createSignal<Theme>(getInitialTheme())

function applyTheme(next: Theme) {
	if (typeof document !== 'undefined') {
		document.documentElement.dataset.theme = next
		document.documentElement.style.colorScheme = next
	}
	try {
		localStorage.setItem('theme', next)
	} catch {
		// ignore (private mode etc.)
	}
}

// Sync DOM on module load (index.html already sets data-theme pre-paint)
applyTheme(theme())

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
		try {
			if (localStorage.getItem('theme') == null) {
				setTheme(e.matches ? 'dark' : 'light')
			}
		} catch {
			// ignore
		}
	}
	mq.addEventListener('change', handler)
	return () => mq.removeEventListener('change', handler)
}
