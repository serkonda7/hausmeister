// German labels for item enums and history actions.
import { m } from '~/paraglide/messages'
import type { ItemStatus, LocationKind, StockReason } from './constants'

export const statusLabel = (s: ItemStatus): string =>
	({
		available: m.items_status_available,
		in_use: m.items_status_in_use,
		on_loan: m.items_status_on_loan,
		needs_repair: m.items_status_needs_repair,
		lost: m.items_status_lost,
		outgrown: m.items_status_outgrown,
		archived: m.items_status_archived,
		given_away: m.items_status_given_away,
		sold: m.items_status_sold,
		disposed: m.items_status_disposed,
	})[s]()

export const locationKindLabel = (k: LocationKind): string =>
	({
		building: m.locations_kind_building,
		room: m.locations_kind_room,
		area: m.locations_kind_area,
		furniture: m.locations_kind_furniture,
		shelf: m.locations_kind_shelf,
		drawer: m.locations_kind_drawer,
		box: m.locations_kind_box,
		other: m.locations_kind_other,
	})[k]()

export const levelLabel = (l: 'view' | 'use' | 'edit' | 'manage'): string =>
	({
		view: m.items_level_view,
		use: m.items_level_use,
		edit: m.items_level_edit,
		manage: m.items_level_manage,
	})[l]()

export const stockReasonLabel = (r: StockReason): string =>
	({
		used: m.stock_reason_used,
		restocked: m.stock_reason_restocked,
		counted: m.stock_reason_counted,
		edited: m.stock_reason_edited,
		other: m.stock_reason_other,
	})[r]()

const ACTIONS: Record<string, () => string> = {
	'item.created': m.history_action_item_created,
	'item.updated': m.history_action_item_updated,
	'item.moved': m.history_action_item_moved,
	'item.status_changed': m.history_action_item_status_changed,
	'item.type_changed': m.history_action_item_type_changed,
	'item.owner_changed': m.history_action_item_owner_changed,
	'item.visibility_changed': m.history_action_item_visibility_changed,
	'item.grant_set': m.history_action_item_grant_set,
	'item.grant_removed': m.history_action_item_grant_removed,
	'item.attributes_migrated': m.history_action_item_attributes_migrated,
	'item.stock_adjusted': m.history_action_item_stock_adjusted,
	'item.lent': m.history_action_item_lent,
	'item.returned': m.history_action_item_returned,
	'item.loan_requested': m.history_action_item_loan_requested,
	'item.loan_approved': m.history_action_item_loan_approved,
	'item.loan_declined': m.history_action_item_loan_declined,
	'item.loan_cancelled': m.history_action_item_loan_cancelled,
	'item.loan_due_changed': m.history_action_item_loan_due_changed,
	'item.transfer_started': m.history_action_item_transfer_started,
	'item.transfer_declined': m.history_action_item_transfer_declined,
	'item.transfer_cancelled': m.history_action_item_transfer_cancelled,
	'item.relation_added': m.history_action_item_relation_added,
	'item.relation_removed': m.history_action_item_relation_removed,
	'attachment.added': m.history_action_attachment_added,
	'attachment.removed': m.history_action_attachment_removed,
	'attachment.kind_changed': m.history_action_attachment_kind_changed,
}

export const historyActionLabel = (action: string): string =>
	(ACTIONS[action] ?? m.history_action_other)()
