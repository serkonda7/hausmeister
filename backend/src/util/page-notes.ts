import type { PageNote } from 'shared/src/book'

const MAX_ENTRIES = 100
const MAX_PAGE_LENGTH = 50
const MAX_TEXT_LENGTH = 2000

function cleanEntry(page: unknown, text: unknown): PageNote | null {
	const cleanText = typeof text === 'string' ? text.trim().slice(0, MAX_TEXT_LENGTH) : ''
	if (!cleanText) return null
	const cleanPage =
		typeof page === 'string' || typeof page === 'number'
			? String(page).trim().slice(0, MAX_PAGE_LENGTH)
			: ''
	return { page: cleanPage, text: cleanText }
}

/** Lenient normalization for legacy TEXT values, JSON strings, and API payloads. */
export function normalizePageNotes(value: unknown): PageNote[] {
	if (value == null) return []
	if (Array.isArray(value)) {
		const out: PageNote[] = []
		for (const entry of value) {
			if (out.length >= MAX_ENTRIES) break
			if (typeof entry === 'string') {
				const clean = cleanEntry('', entry)
				if (clean) out.push(clean)
				continue
			}
			if (typeof entry === 'object' && entry !== null) {
				const record = entry as Record<string, unknown>
				const text = record.text ?? record.dedication ?? record.damage ?? record.note
				const clean = cleanEntry(record.page, text)
				if (clean) out.push(clean)
			}
		}
		return out
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) return []
		try {
			const parsed: unknown = JSON.parse(trimmed)
			if (Array.isArray(parsed)) return normalizePageNotes(parsed)
		} catch {
			// Not JSON — treat as a legacy free-text value.
		}
		return [{ page: '', text: trimmed.slice(0, MAX_TEXT_LENGTH) }]
	}
	return []
}
