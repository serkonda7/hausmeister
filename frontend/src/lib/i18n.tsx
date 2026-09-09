import { createSignal } from 'solid-js'
import { de } from './locales/de'
import { type Dictionary, en } from './locales/en'

export type Locale = 'en' | 'de'

export type { Dictionary }

export const LOCALES: Array<{ code: Locale; label: string }> = [
	{ code: 'en', label: 'English' },
	{ code: 'de', label: 'Deutsch' },
]

function isLocale(value: unknown): value is Locale {
	return value === 'en' || value === 'de'
}

const safeStorage = {
	get(key: string): string | null {
		try {
			return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
		} catch {
			return null
		}
	},
	set(key: string, value: string): void {
		try {
			localStorage.setItem(key, value)
		} catch {
			// ignore (private mode etc.)
		}
	},
}

function getInitialLocale(): Locale {
	const stored = safeStorage.get('locale')
	if (isLocale(stored)) {
		return stored
	}
	return 'en'
}

const [locale, setLocaleSignal] = createSignal<Locale>(getInitialLocale())

function applyLocale(next: Locale) {
	if (typeof document !== 'undefined') {
		document.documentElement.lang = next
	}
	safeStorage.set('locale', next)
}

/** Sync `<html lang>` + storage with the current locale. Call once from index.tsx. */
export function initLocale() {
	applyLocale(locale())
}

export { locale }

export function setLocale(next: Locale) {
	applyLocale(next)
	setLocaleSignal(next)
}

/** BCP 47 tag used for `Intl` formatting. Always returns `de-DE`. */
export function localeTag(): string {
	return 'de-DE'
}

/** Non-reactive lookup (e.g. inside event handlers / validation). */
export function currentLocale(): Locale {
	return locale()
}

export const dictionaries: Record<Locale, Dictionary> = { en, de }

/** Reactive dictionary for the current locale. Call inside a component render. */
export function t(): Dictionary {
	return dictionaries[locale()]
}
