// Shapes returned by the loan and contact server functions.
import type { LoanStatus } from '~/server/db/schema'

export type { LoanStatus }
/** Loans that still block or wait for something. */
export const OPEN_LOAN_STATUSES = ['requested', 'approved', 'out'] as const satisfies LoanStatus[]

/** A user borrower, or a contact (id null once the contact was deleted). */
export type LoanBorrower =
	| { kind: 'user'; id: string; name: string }
	| { kind: 'contact'; id: string | null; name: string }

/** What the caller may do with a loan right now. */
export type LoanActions = {
	approve: boolean
	decline: boolean
	handOver: boolean
	return: boolean
	cancel: boolean
	changeDue: boolean
}

export type LoanRow = {
	id: string
	itemId: string
	status: LoanStatus
	quantity: number
	/** 'YYYY-MM-DD' or null. */
	dueOn: string | null
	/** status out and due_on before today (Europe/Berlin). */
	overdue: boolean
	note: string | null
	borrower: LoanBorrower
	/** The borrower is the caller. */
	mine: boolean
	requestedBy: { id: string; name: string } | null
	createdAt: Date
	outAt: Date | null
	actions: LoanActions
}

/** The loan part of an item page. */
export type ItemLoans = {
	/** Open loans the caller may see: out loans for every viewer; requests for managers and the borrower. */
	open: LoanRow[]
	tracking: 'individual' | 'stock'
	/** How much is not lent out (stock: quantity minus out loans; individual: 1 or 0). */
	available: number
	/** Use: may hand it out directly. */
	canCheckout: boolean
	/** May ask for it (visible, not gone, no open request of the caller). */
	canRequest: boolean
	/** May lend to other people and contacts (admin/member at use). */
	canLendToOthers: boolean
}

export type LoanListRow = LoanRow & {
	item: {
		id: string
		name: string
		shortCode: string | null
		typeIcon: string | null
		/** The caller can open the item page. */
		visible: boolean
	}
}

export type LoanOverview = {
	/** Loans where the caller borrows (requested, approved, out). */
	mine: LoanListRow[]
	/** Requests and approved loans on items the caller manages. */
	requests: LoanListRow[]
	/** Out loans the caller handed out or manages (not the caller's own), overdue first. */
	lentOut: LoanListRow[]
}

export type ContactRow = {
	id: string
	name: string
	email: string | null
	phone: string | null
	notes: string | null
	openLoans: number
}
