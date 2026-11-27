// The item form's base fields as text (what the inputs hold) and their
// conversion to createItemFn / updateItemFn input. Pure, shared by the add and
// edit pages; attributes are handled by AttributeFields (TanStack Form).
import { formatNumber, parseDecimalDe, parseEuroToCents } from '~/lib/format'
import { isValidIsoDate } from '~/lib/item-types/fields'
import { m } from '~/paraglide/messages'
import { ITEM_NAME_MAX } from './constants'
import type { ItemDetail } from './types'

export type ItemBaseValues = {
	name: string
	description: string
	quantity: string
	unit: string
	minQuantity: string
	condition: string
	acquiredOn: string
	price: string
	barcode: string
	tags: string[]
}

export const emptyBaseValues = (): ItemBaseValues => ({
	name: '',
	description: '',
	quantity: '1',
	unit: '',
	minQuantity: '',
	condition: '',
	acquiredOn: '',
	price: '',
	barcode: '',
	tags: [],
})

const plain = (n: number) => formatNumber(n, 6).replace(/\./g, '')

export function baseValuesFromItem(d: Pick<ItemDetail, 'item' | 'tags'>): ItemBaseValues {
	const it = d.item
	const cents = 'priceCents' in it ? it.priceCents : null
	return {
		name: it.name,
		description: it.description ?? '',
		quantity: plain(it.quantity),
		unit: it.unit ?? '',
		minQuantity: it.minQuantity == null ? '' : plain(it.minQuantity),
		condition: it.condition ?? '',
		acquiredOn: it.acquiredOn ?? '',
		price: cents == null ? '' : (cents / 100).toFixed(2).replace('.', ','),
		barcode: it.barcode ?? '',
		tags: d.tags.map((t) => t.name),
	}
}

export type BaseFieldKey = Exclude<keyof ItemBaseValues, 'tags'> | 'tags'
export type BaseErrors = Partial<Record<BaseFieldKey, string>>

export type ParsedBase = {
	name: string
	description: string | null
	quantity: number
	unit: string | null
	minQuantity: number | null
	condition: string | null
	acquiredOn: string | null
	/** Only when `withPrice`. */
	priceCents?: number | null
	barcode: string | null
	tags: string[]
}

const opt = (s: string) => (s.trim() === '' ? null : s.trim())

/** Validates and converts; German error per field. */
export function parseBaseValues(
	v: ItemBaseValues,
	opts: { withPrice: boolean },
): { ok: true; data: ParsedBase } | { ok: false; errors: BaseErrors } {
	const errors: BaseErrors = {}
	const name = v.name.trim()
	if (!name) errors.name = m.item_error_name_required()
	else if (name.length > ITEM_NAME_MAX) errors.name = m.item_error_name_long()
	const quantity = v.quantity.trim() === '' ? 1 : parseDecimalDe(v.quantity)
	if (quantity === null || quantity < 0) errors.quantity = m.item_error_number()
	const minQuantity = v.minQuantity.trim() === '' ? null : parseDecimalDe(v.minQuantity)
	if (v.minQuantity.trim() !== '' && (minQuantity === null || minQuantity < 0))
		errors.minQuantity = m.item_error_number()
	const acquiredOn = opt(v.acquiredOn)
	if (acquiredOn && !isValidIsoDate(acquiredOn)) errors.acquiredOn = m.item_error_date()
	let priceCents: number | null | undefined
	if (opts.withPrice) {
		priceCents = v.price.trim() === '' ? null : parseEuroToCents(v.price)
		if (v.price.trim() !== '' && (priceCents === null || priceCents < 0))
			errors.price = m.item_error_price()
	}
	if (Object.keys(errors).length) return { ok: false, errors }
	return {
		ok: true,
		data: {
			name,
			description: opt(v.description),
			quantity: quantity ?? 1,
			unit: opt(v.unit),
			minQuantity,
			condition: opt(v.condition),
			acquiredOn,
			...(opts.withPrice ? { priceCents: priceCents ?? null } : {}),
			barcode: opt(v.barcode),
			tags: v.tags,
		},
	}
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Keys whose value differs between two snapshots (base values and
 * attributes): what someone else changed while the user was editing.
 */
export function changedKeys(
	before: { base: ItemBaseValues; attributes: Record<string, unknown> },
	after: { base: ItemBaseValues; attributes: Record<string, unknown> },
): { base: (keyof ItemBaseValues)[]; attributes: string[] } {
	const base = (Object.keys(before.base) as (keyof ItemBaseValues)[]).filter(
		(k) => !same(before.base[k], after.base[k]),
	)
	const keys = new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)])
	const attributes = [...keys].filter((k) => !same(before.attributes[k], after.attributes[k]))
	return { base, attributes }
}

export const BASE_LABEL: Record<keyof ItemBaseValues, () => string> = {
	name: () => m.item_field_name(),
	description: () => m.item_field_description(),
	quantity: () => m.item_field_quantity(),
	unit: () => m.item_field_unit(),
	minQuantity: () => m.item_field_min_quantity(),
	condition: () => m.item_field_condition(),
	acquiredOn: () => m.item_field_acquired_on(),
	price: () => m.item_field_price(),
	barcode: () => m.item_field_barcode(),
	tags: () => m.item_field_tags(),
}
