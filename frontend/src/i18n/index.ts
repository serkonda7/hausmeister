import { createSignal } from 'solid-js'
import { de } from './de'
import { en, type TranslationKey } from './en'

export type { TranslationKey }

export type Locale = 'de' | 'en'

export const DEFAULT_LOCALE: Locale = 'de'

/** Selectable languages, labelled in their own language. */
export const LOCALES: Array<{ id: Locale; label: string }> = [
	{ id: 'de', label: 'Deutsch' },
	{ id: 'en', label: 'English' },
]

const LOCALE_KEY = 'hausmeister.locale'

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { de, en }

function isLocale(value: unknown): value is Locale {
	return value === 'de' || value === 'en'
}

function loadLocale(): Locale {
	try {
		const stored = localStorage.getItem(LOCALE_KEY)
		if (isLocale(stored)) return stored
	} catch {
		// Storage unavailable (private mode); fall back to the default.
	}
	return DEFAULT_LOCALE
}

const [locale, setLocaleSignal] = createSignal<Locale>(loadLocale())

export { locale }

export function setLocale(next: Locale): void {
	setLocaleSignal(next)
	document.documentElement.lang = next
	try {
		localStorage.setItem(LOCALE_KEY, next)
	} catch {
		// Ignore persistence failures (e.g. private browsing).
	}
}

/**
 * Translate `key` for the current locale, replacing `{name}` placeholders
 * from `params`. Reactive: reading it inside JSX or an effect re-runs on
 * locale change.
 */
export function t(key: TranslationKey, params?: Record<string, string | number>): string {
	const template = dictionaries[locale()][key] ?? en[key]
	if (!params) return template
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match,
	)
}

document.documentElement.lang = locale()
