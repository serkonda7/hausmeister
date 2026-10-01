import type { DataTableSortDirection } from '@serkonda7/solid-components'
import { locale, type TranslationKey, t } from '../i18n'
import type {
	Book,
	BookFormState,
	Location,
	Ownership,
	Page,
	PageNote,
	ProvenanceEvent,
	ProvenanceKind,
} from '../types'

const PROVENANCE_LABEL_KEY: Record<ProvenanceKind, TranslationKey> = {
	buy: 'prov.buy',
	sell: 'prov.sell',
	other: 'prov.other',
}

export function provenanceLabel(kind: string): string {
	const key = (PROVENANCE_LABEL_KEY as Record<string, TranslationKey>)[kind]
	return key ? t(key) : kind
}

export function formatProvenanceDate(ts: number | null): string {
	if (ts == null || !Number.isFinite(ts)) return ''
	try {
		// ISO YYYY-MM-DD (UTC), matching the <input type="date"> value format.
		return new Date(ts).toISOString().slice(0, 10)
	} catch {
		return ''
	}
}

/** Locale date for record timestamps (date added / date modified). */
export function formatRecordDate(ts: number | null | undefined): string {
	if (ts == null || !Number.isFinite(ts) || ts <= 0) return ''
	try {
		return new Date(ts).toLocaleDateString(locale(), {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		})
	} catch {
		return ''
	}
}

export function formatProvenancePrice(e: Pick<ProvenanceEvent, 'priceCents' | 'kind'>): string {
	if (e.priceCents == null) return e.kind === 'buy' ? t('prov.priceUnknown') : ''
	if (e.priceCents === 0) return t('prov.free')
	const major = (e.priceCents / 100).toLocaleString(locale(), {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
	return `${major} EUR`
}

export function ownershipLabel(o: Ownership): string {
	return t(`ownership.${o}`)
}

export function provenanceTooltip(b: Book): string {
	const events = b.provenance ?? []
	if (events.length === 0) return `${ownershipLabel(b.ownership)} · ${t('prov.noEvents')}`
	return events
		.map((e) => {
			const parts: string[] = [provenanceLabel(e.kind)]
			if (e.party) parts.push(`· ${e.party}`)
			const date = formatProvenanceDate(e.occurredAt)
			if (date) parts.push(`· ${date}`)
			const price = formatProvenancePrice(e)
			if (price) parts.push(`· ${price}`)
			return parts.join(' ')
		})
		.join('\n')
}

export function priceToCents(input: string): number | undefined {
	const trimmed = input.trim().replace(',', '.')
	if (!trimmed) return undefined
	const n = Number(trimmed)
	if (!Number.isFinite(n) || n < 0) return undefined
	return Math.round(n * 100)
}

export const EMPTY_FORM: BookFormState = {
	isbn: '',
	title: '',
	subtitle: '',
	printYear: '',
	dedications: [],
	damages: [],
	languages: '',
	provKind: '',
	provDate: '',
	provParty: '',
	provPrice: '',
}

export function splitList(value: string): string[] {
	return value
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}

export function displayLanguages(b: Book): string {
	if (b.languages?.length) {
		return b.languages.map((language) => language.name).join(', ')
	}
	return ''
}

export function authorNames(b: Book): string {
	return (b.authors ?? []).map((a) => a.name).join(', ')
}

export function tagNames(b: Book): string {
	return (b.tags ?? []).map((t) => t.name).join(', ')
}

export function locationName(b: Book): string {
	return b.location?.fullPath ?? b.location?.name ?? ''
}

export function locationOptions(list: Location[]): Location[] {
	return [...list].sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name))
}

export function locationDescendantIds(list: Location[], id: string): Set<string> {
	const byParent = new Map<string | null, Location[]>()
	for (const l of list) {
		const key = l.parentId ?? null
		const arr = byParent.get(key) ?? []
		arr.push(l)
		byParent.set(key, arr)
	}
	const out = new Set<string>()
	const stack: string[] = [id]
	while (stack.length > 0) {
		const cur = stack.pop() as string
		for (const child of byParent.get(cur) ?? []) {
			if (!out.has(child.id)) {
				out.add(child.id)
				stack.push(child.id)
			}
		}
	}
	return out
}

export function ownerName(b: Book): string {
	return b.owner?.displayName ?? b.owner?.username ?? ''
}

export function userDisplayName(u: { username: string; displayName: string | null }): string {
	return u.displayName ?? u.username
}

export function userLabel(u: { username: string; displayName: string | null }): string {
	return u.displayName ? `${u.displayName} (${u.username})` : u.username
}

export function pageFromPath(pathname: string): Page {
	if (pathname === '/library/add') return 'add-book'
	if (pathname === '/reading') return 'reading'
	if (pathname === '/catalog') return 'catalog'
	if (pathname === '/locations') return 'locations'
	if (pathname === '/users') return 'users'
	return 'library'
}

/** Lenient coercion for API payloads that may still carry legacy string values. */
export function asPageNotes(value: unknown): PageNote[] {
	if (value == null) return []
	if (Array.isArray(value)) {
		const out: PageNote[] = []
		for (const entry of value) {
			if (typeof entry === 'string') {
				const text = entry.trim()
				if (text) out.push({ page: '', text: text.slice(0, 2000) })
				continue
			}
			if (typeof entry === 'object' && entry !== null) {
				const record = entry as Record<string, unknown>
				const rawText = record.text ?? record.dedication ?? record.damage
				const text = typeof rawText === 'string' ? rawText.trim().slice(0, 2000) : ''
				if (!text) continue
				const rawPage = record.page
				const page =
					typeof rawPage === 'string' || typeof rawPage === 'number'
						? String(rawPage).trim().slice(0, 50)
						: ''
				out.push({ page, text })
			}
		}
		return out
	}
	if (typeof value === 'string') {
		const text = value.trim()
		return text ? [{ page: '', text: text.slice(0, 2000) }] : []
	}
	return []
}

export function formatPageNote(n: PageNote): string {
	return n.page ? `${n.page}: ${n.text}` : n.text
}

export function formatPageNotes(notes: PageNote[] | null | undefined): string {
	return (notes ?? []).map(formatPageNote).join('; ')
}

function sortStringFor(b: Book, key: string): string {
	switch (key) {
		case 'title':
			return [b.title, b.subtitle].filter(Boolean).join(' ')
		case 'isbn':
			return b.isbn ?? ''
		case 'authors':
			return authorNames(b)
		case 'publisher':
			return b.publisher?.name ?? ''
		case 'location':
			return locationName(b)
		case 'owner':
			return ownerName(b)
		case 'languages':
			return displayLanguages(b)
		case 'tags':
			return tagNames(b)
		case 'provenance':
			return ownershipLabel(b.ownership)
		case 'dedications':
			return formatPageNotes(b.dedications)
		case 'damages':
			return formatPageNotes(b.damages)
		default:
			return ''
	}
}

export function compareBooks(
	a: Book,
	b: Book,
	key: string,
	direction: DataTableSortDirection,
): number {
	if (key === 'printYear') {
		const av = a.printYear
		const bv = b.printYear
		if (av == null && bv == null) return 0
		if (av == null) return 1
		if (bv == null) return -1
		const result = av - bv
		return direction === 'asc' ? result : -result
	}
	if (key === 'added' || key === 'modified') {
		const av = key === 'added' ? a.createdAt : a.updatedAt
		const bv = key === 'added' ? b.createdAt : b.updatedAt
		if (av == null && bv == null) return 0
		if (av == null) return 1
		if (bv == null) return -1
		const result = av - bv
		return direction === 'asc' ? result : -result
	}
	const as = sortStringFor(a, key)
	const bs = sortStringFor(b, key)
	if (!as && !bs) return 0
	if (!as) return 1
	if (!bs) return -1
	const result = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' })
	return direction === 'asc' ? result : -result
}

export const LIBRARY_VISIBLE_COLUMNS_KEY = 'hausmeister.library.visibleColumns'

export const LIBRARY_DEFAULT_VISIBLE_COLUMNS = [
	'read',
	'title',
	'authors',
	'printYear',
	'publisher',
	'location',
	'owner',
	'languages',
	'tags',
	'provenance',
	'dedications',
	'damages',
	'added',
	'modified',
]

export const LIBRARY_KNOWN_COLUMN_KEYS = [...LIBRARY_DEFAULT_VISIBLE_COLUMNS, 'isbn']

export function loadLibraryVisibleColumns(): string[] {
	try {
		const raw = localStorage.getItem(LIBRARY_VISIBLE_COLUMNS_KEY)
		if (!raw) return [...LIBRARY_DEFAULT_VISIBLE_COLUMNS]
		const parsed: unknown = JSON.parse(raw)
		if (!Array.isArray(parsed)) return [...LIBRARY_DEFAULT_VISIBLE_COLUMNS]
		return parsed.filter(
			(key): key is string => typeof key === 'string' && LIBRARY_KNOWN_COLUMN_KEYS.includes(key),
		)
	} catch {
		return [...LIBRARY_DEFAULT_VISIBLE_COLUMNS]
	}
}
