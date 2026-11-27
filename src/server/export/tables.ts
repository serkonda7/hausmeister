// CSV tables of the export (made for German Excel; src/lib/csv.ts does the
// delimiter, BOM, quoting and formula guard). Values are what a person reads:
// German labels, names instead of ids, de-DE dates and numbers. The raw values
// are in the JSON files.
import { type CsvCell, toCsv } from '../../lib/csv'
import { formatDate, formatDateTime } from '../../lib/format'
import { formatAttributeValue, formatUnknown, splitAttributes } from '../../lib/item-types/display'
import { activeFields } from '../../lib/item-types/fields'
import type { EffectiveField } from '../../lib/item-types/tree'
import type { ItemStatus } from '../../lib/items/constants'
import { statusLabel } from '../../lib/items/labels'
import { loanStatusLabel } from '../../lib/loans/labels'
import type { LoanStatus } from '../../lib/loans/types'
import { m } from '../../paraglide/messages'

/** The parts of an exported item record the tables read. */
export type TableItem = {
	id: string
	typeId: string
	name: string
	description: string | null
	ownerKind: 'household' | 'user' | 'group'
	ownerId: string | null
	visibility: 'household' | 'private'
	locationId: string | null
	containerItemId: string | null
	quantity: number
	unit: string | null
	minQuantity: number | null
	status: ItemStatus
	condition: string | null
	acquiredOn: string | null
	priceCents?: number | null
	currency?: string | null
	barcode: string | null
	shortCode: string | null
	attributes: Record<string, unknown>
	createdAt: Date
	updatedAt: Date
	tagIds: string[]
	omittedReferences?: string[]
}

export type TableLookups = {
	typeName(id: string): string
	userName(id: string): string | undefined
	groupName(id: string): string | undefined
	/** Names of items in the export only. */
	itemName(id: string): string | undefined
	locationPath(id: string): string[]
	tagName(id: string): string | undefined
	files(itemId: string): string[]
}

const NUM = new Intl.NumberFormat('de-DE', { useGrouping: false, maximumFractionDigits: 6 })
const MONEY = new Intl.NumberFormat('de-DE', {
	useGrouping: false,
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
})

/** "12,5": a number German Excel reads as a number (no thousands separator). */
export const csvNumber = (n: number | null | undefined) => (n == null ? '' : NUM.format(n))
/** "16.11.2026 14:03" (Europe/Berlin): Excel reads it as a date and time. */
export const csvDateTime = (d: Date | null | undefined) =>
	d ? formatDateTime(d).replace(', ', ' ') : ''
/** 'YYYY-MM-DD' -> "16.11.2026". */
export const csvDate = (iso: string | null | undefined) =>
	iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(`${iso}T12:00:00Z`) : (iso ?? '')

/** CSV lines without header or BOM, for streaming page by page. */
export function csvRows(rows: CsvCell[][]): string {
	if (rows.length === 0) return ''
	const [first, ...rest] = rows
	return toCsv(first as string[], rest, { bom: false })
}

/** The header line, with the BOM Excel needs to read UTF-8. */
export const csvHeader = (headers: string[]) => toCsv(headers, [], { bom: true })

export const LOCATION_SEPARATOR = ' › '

function ownerText(it: TableItem, l: TableLookups): string {
	if (it.ownerKind === 'household') return m.items_owner_household()
	const name =
		it.ownerId && (it.ownerKind === 'user' ? l.userName(it.ownerId) : l.groupName(it.ownerId))
	return name || m.items_owner_unknown()
}

function containerText(it: TableItem, l: TableLookups): string {
	if (it.containerItemId) return l.itemName(it.containerItemId) ?? m.field_unknown_item()
	return it.omittedReferences?.includes('containerItemId') ? m.export_container_outside() : ''
}

const locationText = (it: TableItem, l: TableLookups) =>
	it.locationId ? l.locationPath(it.locationId).join(LOCATION_SEPARATOR) : ''

export const ITEM_HEADERS = () => [
	m.export_col_short_code(),
	m.export_col_name(),
	m.export_col_type(),
	m.export_col_description(),
	m.export_col_owner(),
	m.export_col_visibility(),
	m.export_col_location(),
	m.export_col_container(),
	m.export_col_quantity(),
	m.export_col_unit(),
	m.export_col_min_quantity(),
	m.export_col_status(),
	m.export_col_condition(),
	m.export_col_acquired_on(),
	m.export_col_price(),
	m.export_col_currency(),
	m.export_col_barcode(),
	m.export_col_tags(),
	m.export_col_files(),
	m.export_col_created_at(),
	m.export_col_updated_at(),
	m.export_col_id(),
]

/** One row of tabellen/gegenstaende.csv. Price and currency are empty when the record has none. */
export function itemRow(it: TableItem, l: TableLookups): CsvCell[] {
	const hasPrice = typeof it.priceCents === 'number'
	return [
		it.shortCode,
		it.name,
		l.typeName(it.typeId),
		it.description,
		ownerText(it, l),
		it.visibility === 'private'
			? m.export_visibility_private()
			: m.export_visibility_household(),
		locationText(it, l),
		containerText(it, l),
		csvNumber(it.quantity),
		it.unit,
		csvNumber(it.minQuantity),
		statusLabel(it.status),
		it.condition,
		csvDate(it.acquiredOn),
		hasPrice ? MONEY.format((it.priceCents as number) / 100) : '',
		hasPrice ? (it.currency ?? '') : '',
		it.barcode,
		it.tagIds
			.map((t) => l.tagName(t))
			.filter(Boolean)
			.join(', '),
		l.files(it.id).join('\n'),
		csvDateTime(it.createdAt),
		csvDateTime(it.updatedAt),
		it.id,
	]
}

/** Columns of a per-type table: a few common ones, the type's active fields, legacy values. */
export function typeTable(fields: readonly EffectiveField[]) {
	const active = activeFields(fields)
	const seen = new Map<string, number>()
	for (const f of active) seen.set(f.label, (seen.get(f.label) ?? 0) + 1)
	// Two fields with the same label (parent and child type) get their key added.
	const label = (f: EffectiveField) =>
		(seen.get(f.label) ?? 0) > 1 ? `${f.label} (${f.key})` : f.label
	const headers = [
		m.export_col_short_code(),
		m.export_col_name(),
		m.export_col_owner(),
		m.export_col_location(),
		m.export_col_status(),
		...active.map(label),
		m.field_legacy(),
		m.export_col_id(),
	]
	const row = (it: TableItem, l: TableLookups): CsvCell[] => {
		const attrs = it.attributes ?? {}
		const resolvers = { userName: l.userName, itemName: l.itemName }
		const { legacy } = splitAttributes(fields, attrs)
		return [
			it.shortCode,
			it.name,
			ownerText(it, l),
			locationText(it, l),
			statusLabel(it.status),
			...active.map((f) => formatAttributeValue(f, attrs[f.key], resolvers)),
			legacy
				.map(
					(e) =>
						`${e.label}: ${e.field ? formatAttributeValue(e.field, e.value, resolvers) : formatUnknown(e.value)}`,
				)
				.join('; '),
			it.id,
		]
	}
	return { headers, row }
}

export const LOAN_HEADERS = () => [
	m.export_col_name(),
	m.export_col_short_code(),
	m.export_col_borrower(),
	m.export_col_quantity(),
	m.export_col_status(),
	m.export_col_requested_at(),
	m.export_col_out_at(),
	m.export_col_due_on(),
	m.export_col_returned_at(),
	m.export_col_note(),
	m.export_col_id(),
]

/** One row of tabellen/ausleihen.csv. */
export function loanRow(
	l: {
		id: string
		quantity: number
		status: LoanStatus
		note: string | null
		createdAt: Date
		outAt: Date | null
		dueOn: string | null
		returnedAt: Date | null
	},
	x: { itemName: string; shortCode: string | null; borrower: string },
): CsvCell[] {
	return [
		x.itemName,
		x.shortCode,
		x.borrower,
		csvNumber(l.quantity),
		loanStatusLabel(l.status),
		csvDateTime(l.createdAt),
		csvDateTime(l.outAt),
		csvDate(l.dueOn),
		csvDateTime(l.returnedAt),
		l.note,
		l.id,
	]
}
