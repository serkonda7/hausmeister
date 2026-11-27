// Item relations (DESIGN §4.5): inputs, output shapes and German labels.
// A relation is directed, "from <kind> to": the bag fits the vacuum. On an item's page each relation appears from that item's side:
//   direction "out"  this item is `from` ("Passt zu: Staubsauger")
//   direction "in"   this item is `to`   ("Passende Teile: Staubsaugerbeutel")
import { z } from 'zod'
import { m } from '~/paraglide/messages'
import { ITEM_RELATION_KINDS, type ItemRelationKind, type ItemStatus } from '../items/constants'
import { idSchema } from '../items/inputs'

export { ITEM_RELATION_KINDS, type ItemRelationKind }
export type RelationDirection = 'out' | 'in'

/** At most this many relations per item (both directions together). */
export const RELATIONS_PER_ITEM_MAX = 200

export const relationInput = z.object({
	fromItemId: idSchema,
	toItemId: idSchema,
	kind: z.enum(ITEM_RELATION_KINDS),
})
export type RelationInput = z.infer<typeof relationInput>

/** The other item of a relation, as the caller may see it (no money). */
export type RelatedItem = {
	id: string
	name: string
	shortCode: string | null
	typeName: string
	typeIcon: string | null
	tracking: 'individual' | 'stock'
	status: ItemStatus
	gone: boolean
	quantity: number
	unit: string | null
	minQuantity: number | null
	lowStock: boolean
}

export type RelationRow = {
	kind: ItemRelationKind
	direction: RelationDirection
	other: RelatedItem
	/** The caller has edit on this item or on the other one. */
	canRemove: boolean
}

export type ItemRelations = {
	/** Only relations whose other item the caller can see; ordered by role (RELATION_ROLES), then name. */
	relations: RelationRow[]
	/** The caller may add relations from this item's page (edit on it). */
	canAdd: boolean
}

/** A kind seen from one side; the order is the order of the groups on the item page. */
export const RELATION_ROLES: readonly { kind: ItemRelationKind; direction: RelationDirection }[] = [
	{ kind: 'fits', direction: 'in' },
	{ kind: 'fits', direction: 'out' },
	{ kind: 'accessory_of', direction: 'in' },
	{ kind: 'accessory_of', direction: 'out' },
	{ kind: 'part_of', direction: 'in' },
	{ kind: 'part_of', direction: 'out' },
	{ kind: 'replaces', direction: 'out' },
	{ kind: 'replaces', direction: 'in' },
]

export const roleToken = (r: { kind: ItemRelationKind; direction: RelationDirection }) =>
	`${r.kind}:${r.direction}`

/** Group heading on the item page: what the listed items are to this one. */
export function relationRoleLabel(kind: ItemRelationKind, direction: RelationDirection): string {
	const out = direction === 'out'
	switch (kind) {
		case 'fits':
			return out ? m.relations_role_fits_out() : m.relations_role_fits_in()
		case 'accessory_of':
			return out ? m.relations_role_accessory_out() : m.relations_role_accessory_in()
		case 'part_of':
			return out ? m.relations_role_part_out() : m.relations_role_part_in()
		case 'replaces':
			return out ? m.relations_role_replaces_out() : m.relations_role_replaces_in()
	}
}

/** Option text when adding from this item's page: "Dieser Gegenstand passt zu …". */
export function relationRoleChoice(kind: ItemRelationKind, direction: RelationDirection): string {
	const out = direction === 'out'
	switch (kind) {
		case 'fits':
			return out ? m.relations_choice_fits_out() : m.relations_choice_fits_in()
		case 'accessory_of':
			return out ? m.relations_choice_accessory_out() : m.relations_choice_accessory_in()
		case 'part_of':
			return out ? m.relations_choice_part_out() : m.relations_choice_part_in()
		case 'replaces':
			return out ? m.relations_choice_replaces_out() : m.relations_choice_replaces_in()
	}
}
