import { PROVENANCE_CURRENCY } from 'shared/src/book'
import { locale, t } from '../i18n'
import type { Book, Location, Ownership, PageNote, ProvenanceEvent, PublicUser } from '../types'

export function provenanceLabel(kind: string): string {
	return kind === 'buy' || kind === 'sell' || kind === 'other' ? t(`prov.${kind}`) : kind
}

/** ISO YYYY-MM-DD (UTC), matching the <input type="date"> value format. */
export function formatProvenanceDate(ts: number | null): string {
	if (ts == null || !Number.isFinite(ts)) return ''
	try {
		return new Date(ts).toISOString().slice(0, 10)
	} catch {
		return ''
	}
}

/** Locale date for record timestamps (date added / date modified / read). */
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
	return `${major} ${PROVENANCE_CURRENCY}`
}

/** Party · date · price, skipping unknown parts. */
export function provenanceDetails(e: ProvenanceEvent): string[] {
	const parts = [e.party, formatProvenanceDate(e.occurredAt), formatProvenancePrice(e)]
	return parts.filter((p): p is string => Boolean(p))
}

export function ownershipLabel(o: Ownership): string {
	return t(`ownership.${o}`)
}

export function provenanceTooltip(b: Book): string {
	if (b.provenance.length === 0) return `${ownershipLabel(b.ownership)} · ${t('prov.noEvents')}`
	return b.provenance
		.map((e) => [provenanceLabel(e.kind), ...provenanceDetails(e)].join(' · '))
		.join('\n')
}

export function priceToCents(input: string): number | undefined {
	const trimmed = input.trim().replace(',', '.')
	if (!trimmed) return undefined
	const n = Number(trimmed)
	if (!Number.isFinite(n) || n < 0) return undefined
	return Math.round(n * 100)
}

export function joinNames(entries: Array<{ name: string }>): string {
	return entries.map((e) => e.name).join(', ')
}

export function locationName(b: Book): string {
	return b.location?.fullPath ?? ''
}

export function locationLabel(l: Location): string {
	return l.fullPath ?? l.name
}

export function sortLocations(list: Location[]): Location[] {
	return [...list].sort((a, b) => locationLabel(a).localeCompare(locationLabel(b)))
}

/** Ids of `id` and everything nested below it. */
export function locationSubtreeIds(list: Location[], id: string): Set<string> {
	const out = new Set([id])
	for (let grew = true; grew; ) {
		grew = false
		for (const l of list) {
			if (l.parentId && out.has(l.parentId) && !out.has(l.id)) {
				out.add(l.id)
				grew = true
			}
		}
	}
	return out
}

export function userDisplayName(u: Pick<PublicUser, 'username' | 'displayName'>): string {
	return u.displayName ?? u.username
}

export function userLabel(u: Pick<PublicUser, 'username' | 'displayName'>): string {
	return u.displayName ? `${u.displayName} (${u.username})` : u.username
}

export function ownerName(b: Book): string {
	return b.owner ? userDisplayName(b.owner) : ''
}

export function formatPageNote(n: PageNote): string {
	return n.page ? `${n.page}: ${n.text}` : n.text
}

export function formatPageNotes(notes: PageNote[]): string {
	return notes.map(formatPageNote).join('; ')
}
