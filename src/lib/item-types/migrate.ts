// Attribute migration (DESIGN §4.3 "Schema evolution"). One planner serves both
// cases that need a preview: a field's kind (or options) changes, and an item's
// type changes. Given the target field list and an item's stored attributes:
//  - kept:      key is active in the target and the value fits as-is
//  - converted: key is active and the value fits after a lossless conversion
//               (e.g. "x" -> ["x"], 12 -> "12", "12,5" -> 12.5)
//  - removed:   key is active but the value doesn't fit the field's kind -> lost
//  - legacy:    key isn't active in the target (hidden or unknown) -> kept and
//               shown under "Alte Felder"
// Fit is checked shape-only (BuildOptions.lenient): tightened min/max or a new
// `required` never deletes data.
import { parseDecimalDe } from '../format'
import {
	activeFields,
	type FieldDefinition,
	fieldSchema,
	isMultiple,
	normalizeEmpty,
} from './fields'

export type MigrationPlan = {
	/** The attributes after migration (legacy values included). */
	attributes: Record<string, unknown>
	kept: string[]
	converted: string[]
	removed: string[]
	legacy: string[]
	/** Active required fields without a value afterwards (the form should ask). */
	missingRequired: string[]
}

function fits(
	field: FieldDefinition,
	value: unknown,
): { ok: true; value: unknown } | { ok: false } {
	const r = fieldSchema(field, { lenient: true }).safeParse(value)
	return r.success && r.data !== undefined ? { ok: true, value: r.data } : { ok: false }
}

/** Lossless conversion candidates for `value` towards `field`'s kind. */
function candidates(field: FieldDefinition, value: unknown): unknown[] {
	const out: unknown[] = []
	const multi = isMultiple(field)
	if (multi && !Array.isArray(value)) out.push([value])
	if (!multi && Array.isArray(value) && value.length === 1) out.push(value[0])
	const scalar = Array.isArray(value) && value.length === 1 ? value[0] : value
	const textual = ['text', 'longtext', 'select', 'multiselect', 'barcode', 'isbn', 'url']
	if (typeof scalar === 'number' && textual.includes(field.kind)) {
		const s = String(scalar)
		out.push(multi ? [s] : s)
	}
	if (typeof scalar === 'boolean' && textual.includes(field.kind)) {
		out.push(multi ? [String(scalar)] : String(scalar))
	}
	if (typeof scalar === 'string' && (field.kind === 'integer' || field.kind === 'decimal')) {
		const n = parseDecimalDe(scalar)
		if (n !== null) out.push(n)
	}
	if (field.kind === 'measure' && typeof scalar === 'number') {
		const unit = field.units[0]
		out.push({ value: scalar, unit })
	}
	if (
		(field.kind === 'integer' || field.kind === 'decimal') &&
		scalar &&
		typeof scalar === 'object' &&
		'value' in scalar &&
		typeof (scalar as { value: unknown }).value === 'number'
	) {
		out.push((scalar as { value: number }).value)
	}
	return out
}

/** Migrates one stored value to `field`. */
export function migrateValue(
	field: FieldDefinition,
	value: unknown,
): { status: 'kept' | 'converted'; value: unknown } | { status: 'removed' } {
	const direct = fits(field, value)
	if (direct.ok) {
		const same = JSON.stringify(direct.value) === JSON.stringify(value)
		return { status: same ? 'kept' : 'converted', value: direct.value }
	}
	for (const c of candidates(field, value)) {
		const r = fits(field, c)
		if (r.ok) return { status: 'converted', value: r.value }
	}
	return { status: 'removed' }
}

/** Plans the migration of one item's attributes to a target (effective) field list. */
export function planAttributes(
	targetFields: readonly FieldDefinition[],
	attributes: Record<string, unknown>,
): MigrationPlan {
	const active = new Map(activeFields(targetFields).map((f) => [f.key, f]))
	const plan: MigrationPlan = {
		attributes: {},
		kept: [],
		converted: [],
		removed: [],
		legacy: [],
		missingRequired: [],
	}
	for (const [key, value] of Object.entries(attributes ?? {})) {
		const field = active.get(key)
		if (!field) {
			if (value === undefined || value === null) continue
			plan.attributes[key] = value
			plan.legacy.push(key)
			continue
		}
		if (normalizeEmpty(field, value) === undefined) continue
		const r = migrateValue(field, value)
		if (r.status === 'removed') plan.removed.push(key)
		else {
			plan.attributes[key] = r.value
			plan[r.status].push(key)
		}
	}
	for (const f of active.values())
		if (f.required && f.kind !== 'boolean' && !(f.key in plan.attributes))
			plan.missingRequired.push(f.key)
	return plan
}

/** Whether applying the plan changes stored data in a way the user must confirm. */
export const planNeedsConfirmation = (p: MigrationPlan) =>
	p.removed.length > 0 || p.converted.length > 0

/**
 * Preview and result of changing an item's TYPE: the same planner with the new
 * type's effective fields. Values for keys the new type lacks become legacy.
 */
export function planTypeChange(
	newTypeFields: readonly FieldDefinition[],
	attributes: Record<string, unknown>,
): MigrationPlan {
	return planAttributes(newTypeFields, attributes)
}
