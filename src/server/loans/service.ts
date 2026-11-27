// Loans (DESIGN §3.2, §5.3): who has an item right now.
//
//   use       check out directly (to oneself; admins and members also to another user or an external contact), hand over an approved loan, return, change the due date
//   view      request a loan; the item's managers approve or decline
//   manage    approve, decline
//   borrower  cancel an open request, mark an approved loan as picked up, return
// Individual items can be out once at a time and show `on_loan` while out (back to `available` on return).
// Stock items lend quantities: the sum of out loans never exceeds the quantity; their status does not change.
// Gone items (archived, given away, sold, disposed) cannot be lent.
//
// Visibility: out loans (the current holder) are part of the item for every viewer; requests and approved loans only for managers and the borrower.
// A borrower always sees their own loans, with the item's name, even when the item itself is not visible to them (someone lent it to them on purpose).
// Request-workflow events are hidden below manage in the history.
import { and, asc, eq, inArray, ne, or, type SQL, sql } from 'drizzle-orm'
import { isoDayInBerlin } from '../../lib/format'
import { isGoneStatus } from '../../lib/items/constants'
import {
	type ApproveLoanInput,
	approveLoanInput,
	type CheckoutInput,
	checkoutInput,
	handOverLoanInput,
	type LoanRefInput,
	loanRefInput,
	type RequestLoanInput,
	requestLoanInput,
	setLoanDueInput,
} from '../../lib/loans/inputs'
import type {
	ItemLoans,
	LoanActions,
	LoanBorrower,
	LoanListRow,
	LoanOverview,
	LoanRow,
} from '../../lib/loans/types'
import { m } from '../../paraglide/messages'
import { atLeast, itemLevels, itemsAtLeastWhere, type Level } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb, DbOrTx } from '../db/client'
import { contacts, type Item, items, itemTypes, type Loan, loans, users } from '../db/schema'
import { recordItemEvent } from '../history/record'
import { requireItem, writeVersioned } from '../items/access'
import { forbidden, ItemsError, parseInput } from '../items/errors'
import { managerAudience, notify } from '../notifications/service'

const asDb = (tx: DbOrTx) => tx as unknown as AppDb
const OPEN = ['requested', 'approved', 'out'] as const

const userName = (db: DbOrTx, id: string) =>
	db.select({ n: users.displayName }).from(users).where(eq(users.id, id)).get()?.n ??
	m.history_unknown_actor()

function tracking(db: DbOrTx, item: Pick<Item, 'typeId'>): 'individual' | 'stock' {
	return (
		db
			.select({ t: itemTypes.tracking })
			.from(itemTypes)
			.where(eq(itemTypes.id, item.typeId))
			.get()?.t ?? 'individual'
	)
}

/** Sum of quantities out (excluding `exceptLoanId`). */
function outQuantity(db: DbOrTx, itemId: string, exceptLoanId?: string): number {
	return (
		db
			.select({ n: sql<number>`coalesce(sum(${loans.quantity}), 0)` })
			.from(loans)
			.where(
				and(
					eq(loans.itemId, itemId),
					eq(loans.status, 'out'),
					exceptLoanId ? ne(loans.id, exceptLoanId) : undefined,
				),
			)
			.get()?.n ?? 0
	)
}

function available(db: DbOrTx, item: Item, mode = tracking(db, item)): number {
	const out = outQuantity(db, item.id)
	return mode === 'stock' ? Math.max(0, item.quantity - out) : out > 0 ? 0 : 1
}

/** LOAN_UNAVAILABLE unless `quantity` more can go out. Returns the quantity to lend. */
function assertAvailable(db: DbOrTx, item: Item, quantity: number | undefined): number {
	if (isGoneStatus(item.status)) throw new ItemsError(422, 'LOAN_ITEM_GONE')
	const mode = tracking(db, item)
	if (mode === 'individual') {
		if (quantity !== undefined && quantity !== 1) throw new ItemsError(422, 'LOAN_QUANTITY')
		if (available(db, item, mode) < 1) throw new ItemsError(409, 'LOAN_UNAVAILABLE')
		return 1
	}
	const q = quantity ?? 1
	if (q > available(db, item, mode) + 1e-9) throw new ItemsError(409, 'LOAN_UNAVAILABLE')
	return q
}

/** Individual items show on_loan while out and available again on return. */
function syncStatus(tx: DbOrTx, item: Item, out: boolean): { from: string; to: string } | null {
	if (tracking(tx, item) !== 'individual') return null
	if (out && item.status !== 'on_loan' && !isGoneStatus(item.status)) {
		writeVersioned(tx, item.id, item.version, { status: 'on_loan' })
		return { from: item.status, to: 'on_loan' }
	}
	if (!out && item.status === 'on_loan' && outQuantity(tx, item.id) === 0) {
		writeVersioned(tx, item.id, item.version, { status: 'available' })
		return { from: 'on_loan', to: 'available' }
	}
	return null
}

type Borrower = { userId: string | null; contactId: string | null; name: string }

function resolveBorrower(db: DbOrTx, ctx: AuthCtx, input: CheckoutInput['borrower']): Borrower {
	if (!input || (input.kind === 'user' && input.id === ctx.userId))
		return { userId: ctx.userId, contactId: null, name: userName(db, ctx.userId) }
	// Guests lend only to themselves (they cannot even list people or contacts).
	if (ctx.role === 'guest') throw forbidden()
	if (input.kind === 'user') {
		const u = db
			.select({ n: users.displayName, disabledAt: users.disabledAt })
			.from(users)
			.where(eq(users.id, input.id))
			.get()
		if (!u || u.disabledAt) throw new ItemsError(422, 'LOAN_BORROWER_INVALID')
		return { userId: input.id, contactId: null, name: u.n }
	}
	const c = db.select({ n: contacts.name }).from(contacts).where(eq(contacts.id, input.id)).get()
	if (!c) throw new ItemsError(422, 'CONTACT_NOT_FOUND')
	return { userId: null, contactId: input.id, name: c.n }
}

/** How a loan's borrower appears in events: users by id (resolved live), contacts by name. */
function borrowerDiff(b: Pick<Loan, 'borrowerUserId' | 'borrowerContactId'>, name: string) {
	return b.borrowerUserId ? { borrowerUserId: b.borrowerUserId } : { borrowerName: name }
}

function borrowerOf(db: DbOrTx, loan: Loan): Borrower {
	if (loan.borrowerUserId)
		return {
			userId: loan.borrowerUserId,
			contactId: null,
			name: userName(db, loan.borrowerUserId),
		}
	const c = loan.borrowerContactId
		? db
				.select({ n: contacts.name })
				.from(contacts)
				.where(eq(contacts.id, loan.borrowerContactId))
				.get()
		: undefined
	return {
		userId: null,
		contactId: loan.borrowerContactId,
		name: c?.n ?? m.loans_contact_deleted(),
	}
}

// --- Loading a loan for an action ------------------------------------------------

type LoadedLoan = { loan: Loan; item: Item; level: Level }

/**
 * The loan with its item and the caller's level on it.
 * LOAN_NOT_FOUND when it does not exist or the caller can see neither the item nor the loan (as its borrower or requester).
 */
function loadLoan(db: DbOrTx, ctx: AuthCtx, loanId: string): LoadedLoan {
	const loan = db.select().from(loans).where(eq(loans.id, loanId)).get()
	if (!loan) throw new ItemsError(404, 'LOAN_NOT_FOUND')
	const item = db.select().from(items).where(eq(items.id, loan.itemId)).get()
	if (!item) throw new ItemsError(404, 'LOAN_NOT_FOUND')
	const level = itemLevels(asDb(db), ctx, [item]).get(item.id) ?? 'none'
	const involved = loan.borrowerUserId === ctx.userId || loan.requestedBy === ctx.userId
	if (!involved && (level === 'none' || (loan.status !== 'out' && !atLeast(level, 'manage'))))
		throw new ItemsError(404, 'LOAN_NOT_FOUND')
	return { loan, item, level }
}

function actionsFor(ctx: AuthCtx, loan: Loan, level: Level): LoanActions {
	const manage = atLeast(level, 'manage')
	const use = atLeast(level, 'use')
	const borrower = loan.borrowerUserId === ctx.userId
	const requester = loan.requestedBy === ctx.userId
	const s = loan.status
	return {
		approve: manage && s === 'requested',
		decline: manage && (s === 'requested' || s === 'approved'),
		handOver: s === 'approved' && (use || borrower),
		return: s === 'out' && (use || borrower || loan.lentBy === ctx.userId),
		cancel: (borrower || requester) && (s === 'requested' || s === 'approved'),
		changeDue: OPEN.includes(s as (typeof OPEN)[number]) && (use || loan.lentBy === ctx.userId),
	}
}

function allow(cond: boolean) {
	if (!cond) throw forbidden()
}

function assertStatus(loan: Loan, ...allowed: Loan['status'][]) {
	if (!allowed.includes(loan.status)) throw new ItemsError(409, 'LOAN_STATE', loan.status)
}

// --- Writes ------------------------------------------------------------------------

/** Use: hands the item out now. Returns { loanId }. */
export function checkoutItem(db: AppDb, ctx: AuthCtx, raw: CheckoutInput): { loanId: string } {
	const input = parseInput(checkoutInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.itemId, 'use')
		const borrower = resolveBorrower(tx, ctx, input.borrower)
		const quantity = assertAvailable(tx, item, input.quantity)
		const now = new Date()
		const loan = tx
			.insert(loans)
			.values({
				itemId: item.id,
				quantity,
				borrowerUserId: borrower.userId,
				borrowerContactId: borrower.contactId,
				status: 'out',
				note: input.note ?? null,
				requestedBy: ctx.userId,
				lentBy: ctx.userId,
				outAt: now,
				dueOn: input.dueOn ?? null,
			})
			.returning()
			.get()
		const status = syncStatus(tx, item, true)
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.lent',
			itemId: item.id,
			diff: {
				loanId: loan.id,
				...borrowerDiff(loan, borrower.name),
				...(tracking(tx, item) === 'stock' ? { lentQuantity: quantity } : {}),
				...(loan.dueOn ? { dueOn: loan.dueOn } : {}),
				...(status ? { status } : {}),
			},
		})
		return { loanId: loan.id }
	})
}

/** View: asks the managers. Returns { loanId }. */
export function requestLoan(db: AppDb, ctx: AuthCtx, raw: RequestLoanInput): { loanId: string } {
	const input = parseInput(requestLoanInput, raw)
	return db.transaction((tx) => {
		const { item } = requireItem(tx, ctx, input.itemId, 'view')
		if (isGoneStatus(item.status)) throw new ItemsError(422, 'LOAN_ITEM_GONE')
		const mode = tracking(tx, item)
		if (mode === 'individual' && input.quantity !== undefined && input.quantity !== 1)
			throw new ItemsError(422, 'LOAN_QUANTITY')
		if (mode === 'stock' && (input.quantity ?? 1) > item.quantity)
			throw new ItemsError(422, 'LOAN_QUANTITY')
		const dup = tx
			.select({ id: loans.id })
			.from(loans)
			.where(
				and(
					eq(loans.itemId, item.id),
					eq(loans.borrowerUserId, ctx.userId),
					inArray(loans.status, ['requested', 'approved']),
				),
			)
			.get()
		if (dup) throw new ItemsError(409, 'LOAN_DUPLICATE')
		const loan = tx
			.insert(loans)
			.values({
				itemId: item.id,
				quantity: mode === 'stock' ? (input.quantity ?? 1) : 1,
				borrowerUserId: ctx.userId,
				status: 'requested',
				note: input.note ?? null,
				requestedBy: ctx.userId,
				dueOn: input.dueOn ?? null,
			})
			.returning()
			.get()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.loan_requested',
			itemId: item.id,
			diff: {
				loanId: loan.id,
				borrowerUserId: ctx.userId,
				...(mode === 'stock' ? { lentQuantity: loan.quantity } : {}),
				...(loan.dueOn ? { dueOn: loan.dueOn } : {}),
			},
		})
		notify(tx, {
			userIds: managerAudience(tx, item),
			exclude: ctx.userId,
			kind: 'loan.requested',
			itemId: item.id,
			payload: {
				loanId: loan.id,
				actorName: userName(tx, ctx.userId),
				quantity: loan.quantity,
				dueOn: loan.dueOn,
			},
		})
		return { loanId: loan.id }
	})
}

function handOut(
	tx: DbOrTx,
	ctx: AuthCtx,
	loan: Loan,
	item: Item,
	dueOn: string | null | undefined,
) {
	assertAvailable(tx, item, tracking(tx, item) === 'stock' ? loan.quantity : undefined)
	const due = dueOn === undefined ? loan.dueOn : dueOn
	tx.update(loans)
		.set({ status: 'out', outAt: new Date(), lentBy: ctx.userId, dueOn: due })
		.where(eq(loans.id, loan.id))
		.run()
	const status = syncStatus(tx, item, true)
	const b = borrowerOf(tx, loan)
	recordItemEvent(tx, {
		actorId: ctx.userId,
		action: 'item.lent',
		itemId: item.id,
		diff: {
			loanId: loan.id,
			...borrowerDiff(loan, b.name),
			...(tracking(tx, item) === 'stock' ? { lentQuantity: loan.quantity } : {}),
			...(due ? { dueOn: due } : {}),
			...(status ? { status } : {}),
		},
	})
}

/** Manage: requested -> approved (or straight to out with handOver). */
export function approveLoan(db: AppDb, ctx: AuthCtx, raw: ApproveLoanInput) {
	const input = parseInput(approveLoanInput, raw)
	db.transaction((tx) => {
		const { loan, item, level } = loadLoan(tx, ctx, input.loanId)
		allow(actionsFor(ctx, loan, level).approve)
		const dueOn = input.dueOn === undefined ? loan.dueOn : input.dueOn
		tx.update(loans)
			.set({ status: 'approved', decidedBy: ctx.userId, decidedAt: new Date(), dueOn })
			.where(eq(loans.id, loan.id))
			.run()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.loan_approved',
			itemId: item.id,
			diff: {
				loanId: loan.id,
				borrowerUserId: loan.borrowerUserId,
				...(dueOn ? { dueOn } : {}),
			},
		})
		if (input.handOver) handOut(tx, ctx, { ...loan, status: 'approved', dueOn }, item, dueOn)
		if (loan.borrowerUserId)
			notify(tx, {
				userIds: [loan.borrowerUserId],
				exclude: ctx.userId,
				kind: 'loan.approved',
				itemId: item.id,
				payload: { loanId: loan.id, actorName: userName(tx, ctx.userId), dueOn },
			})
	})
}

/** Manage: requested/approved -> declined. */
export function declineLoan(db: AppDb, ctx: AuthCtx, raw: LoanRefInput) {
	const input = parseInput(loanRefInput, raw)
	db.transaction((tx) => {
		const { loan, item, level } = loadLoan(tx, ctx, input.loanId)
		allow(actionsFor(ctx, loan, level).decline)
		tx.update(loans)
			.set({ status: 'declined', decidedBy: ctx.userId, decidedAt: new Date() })
			.where(eq(loans.id, loan.id))
			.run()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.loan_declined',
			itemId: item.id,
			diff: { loanId: loan.id, borrowerUserId: loan.borrowerUserId },
		})
		if (loan.borrowerUserId)
			notify(tx, {
				userIds: [loan.borrowerUserId],
				exclude: ctx.userId,
				kind: 'loan.declined',
				itemId: item.id,
				payload: { loanId: loan.id, actorName: userName(tx, ctx.userId) },
			})
	})
}

/** Borrower or requester: withdraws an open request (requested/approved -> cancelled). */
export function cancelLoan(db: AppDb, ctx: AuthCtx, raw: LoanRefInput) {
	const input = parseInput(loanRefInput, raw)
	db.transaction((tx) => {
		const { loan, item, level } = loadLoan(tx, ctx, input.loanId)
		assertStatus(loan, 'requested', 'approved')
		allow(actionsFor(ctx, loan, level).cancel)
		tx.update(loans).set({ status: 'cancelled' }).where(eq(loans.id, loan.id)).run()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.loan_cancelled',
			itemId: item.id,
			diff: { loanId: loan.id, borrowerUserId: loan.borrowerUserId },
		})
	})
}

/** Use or borrower: approved -> out. */
export function handOverLoan(
	db: AppDb,
	ctx: AuthCtx,
	raw: { loanId: string; dueOn?: string | null },
) {
	const input = parseInput(handOverLoanInput, raw)
	db.transaction((tx) => {
		const { loan, item, level } = loadLoan(tx, ctx, input.loanId)
		assertStatus(loan, 'approved')
		allow(actionsFor(ctx, loan, level).handOver)
		handOut(tx, ctx, loan, item, input.dueOn)
	})
}

/** Use, borrower or lender: out -> returned. */
export function returnLoan(db: AppDb, ctx: AuthCtx, raw: LoanRefInput) {
	const input = parseInput(loanRefInput, raw)
	db.transaction((tx) => {
		const { loan, item, level } = loadLoan(tx, ctx, input.loanId)
		assertStatus(loan, 'out')
		allow(actionsFor(ctx, loan, level).return)
		tx.update(loans)
			.set({ status: 'returned', returnedAt: new Date(), returnedBy: ctx.userId })
			.where(eq(loans.id, loan.id))
			.run()
		const status = syncStatus(tx, item, false)
		const b = borrowerOf(tx, loan)
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.returned',
			itemId: item.id,
			diff: {
				loanId: loan.id,
				...borrowerDiff(loan, b.name),
				...(tracking(tx, item) === 'stock' ? { lentQuantity: loan.quantity } : {}),
				...(status ? { status } : {}),
			},
		})
	})
}

/** Use or lender: changes (or clears) the due date of an open loan. */
export function setLoanDue(db: AppDb, ctx: AuthCtx, raw: { loanId: string; dueOn: string | null }) {
	const input = parseInput(setLoanDueInput, raw)
	db.transaction((tx) => {
		const { loan, item, level } = loadLoan(tx, ctx, input.loanId)
		assertStatus(loan, ...OPEN)
		allow(actionsFor(ctx, loan, level).changeDue)
		if (loan.dueOn === input.dueOn) return
		tx.update(loans).set({ dueOn: input.dueOn }).where(eq(loans.id, loan.id)).run()
		recordItemEvent(tx, {
			actorId: ctx.userId,
			action: 'item.loan_due_changed',
			itemId: item.id,
			diff: { loanId: loan.id, dueOn: { from: loan.dueOn, to: input.dueOn } },
		})
	})
}

// --- Reads -------------------------------------------------------------------------

type JoinedLoan = Loan & {
	borrowerName: string | null
	contactName: string | null
	requesterName: string | null
}

function joinedLoans(db: DbOrTx, where: SQL | undefined): JoinedLoan[] {
	const borrower = sql<
		string | null
	>`(select display_name from users where users.id = ${loans.borrowerUserId})`
	const requester = sql<
		string | null
	>`(select display_name from users where users.id = ${loans.requestedBy})`
	return db
		.select({
			loan: loans,
			borrowerName: borrower,
			contactName: contacts.name,
			requesterName: requester,
		})
		.from(loans)
		.leftJoin(contacts, eq(contacts.id, loans.borrowerContactId))
		.where(where)
		.orderBy(asc(loans.createdAt), asc(loans.id))
		.all()
		.map((r) => ({
			...r.loan,
			borrowerName: r.borrowerName,
			contactName: r.contactName,
			requesterName: r.requesterName,
		}))
}

function toRow(ctx: AuthCtx, l: JoinedLoan, level: Level, today: string): LoanRow {
	const borrower: LoanBorrower = l.borrowerUserId
		? { kind: 'user', id: l.borrowerUserId, name: l.borrowerName ?? m.history_unknown_actor() }
		: {
				kind: 'contact',
				id: l.borrowerContactId,
				name: l.contactName ?? m.loans_contact_deleted(),
			}
	return {
		id: l.id,
		itemId: l.itemId,
		status: l.status,
		quantity: l.quantity,
		dueOn: l.dueOn,
		overdue: l.status === 'out' && !!l.dueOn && l.dueOn < today,
		note: l.note,
		borrower,
		mine: l.borrowerUserId === ctx.userId,
		requestedBy: l.requestedBy
			? { id: l.requestedBy, name: l.requesterName ?? m.history_unknown_actor() }
			: null,
		createdAt: l.createdAt,
		outAt: l.outAt,
		actions: actionsFor(ctx, l, level),
	}
}

/** The loan part of the item page (view). */
export function getItemLoans(db: AppDb, ctx: AuthCtx, itemId: string, now = new Date()): ItemLoans {
	const { item, level } = requireItem(db, ctx, itemId, 'view')
	const manage = atLeast(level, 'manage')
	const seeAll = manage
		? inArray(loans.status, [...OPEN])
		: or(
				eq(loans.status, 'out'),
				and(
					inArray(loans.status, ['requested', 'approved']),
					or(eq(loans.borrowerUserId, ctx.userId), eq(loans.requestedBy, ctx.userId)),
				),
			)
	const today = isoDayInBerlin(now)
	const open = joinedLoans(db, and(eq(loans.itemId, item.id), seeAll)).map((l) =>
		toRow(ctx, l, level, today),
	)
	const mode = tracking(db, item)
	const gone = isGoneStatus(item.status)
	const mineOpen = open.some(
		(l) => l.mine && (l.status === 'requested' || l.status === 'approved'),
	)
	return {
		open,
		tracking: mode,
		available: available(db, item, mode),
		canCheckout: atLeast(level, 'use') && !gone,
		canRequest: !gone && !mineOpen,
		canLendToOthers: atLeast(level, 'use') && ctx.role !== 'guest' && !gone,
	}
}

/** The caller's loans page: what they borrow, what waits for them, what they lent out. */
export function getLoanOverview(db: AppDb, ctx: AuthCtx, now = new Date()): LoanOverview {
	const today = isoDayInBerlin(now)
	const managed = itemsAtLeastWhere(ctx, 'manage')
	const withItems = (where: SQL) => {
		const rows = joinedLoans(db, where)
		if (rows.length === 0) return [] as LoanListRow[]
		const ids = [...new Set(rows.map((r) => r.itemId))]
		const its = db
			.select({
				id: items.id,
				name: items.name,
				shortCode: items.shortCode,
				ownerKind: items.ownerKind,
				ownerId: items.ownerId,
				visibility: items.visibility,
				typeIcon: itemTypes.icon,
			})
			.from(items)
			.innerJoin(itemTypes, eq(itemTypes.id, items.typeId))
			.where(inArray(items.id, ids))
			.all()
		const byId = new Map(its.map((i) => [i.id, i]))
		const levels = itemLevels(db, ctx, its)
		return rows.flatMap((l) => {
			const it = byId.get(l.itemId)
			if (!it) return []
			const level = levels.get(it.id) ?? 'none'
			return [
				{
					...toRow(ctx, l, level, today),
					item: {
						id: it.id,
						name: it.name,
						shortCode: level === 'none' ? null : it.shortCode,
						typeIcon: it.typeIcon,
						visible: level !== 'none',
					},
				},
			]
		})
	}
	const mine = withItems(
		and(eq(loans.borrowerUserId, ctx.userId), inArray(loans.status, [...OPEN])) as SQL,
	)
	const requests = withItems(
		and(
			inArray(loans.status, ['requested', 'approved']),
			sql`${loans.itemId} in (select ${items.id} from ${items} where ${managed})`,
		) as SQL,
	).filter((l) => !l.mine)
	const lentOut = withItems(
		and(
			eq(loans.status, 'out'),
			or(
				eq(loans.lentBy, ctx.userId),
				sql`${loans.itemId} in (select ${items.id} from ${items} where ${managed})`,
			),
		) as SQL,
	)
		.filter((l) => !l.mine)
		.sort(
			(a, b) =>
				Number(b.overdue) - Number(a.overdue) ||
				(a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'),
		)
	return { mine, requests, lentOut }
}
