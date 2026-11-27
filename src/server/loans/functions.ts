// Server functions for loans.
// Rules (levels, borrower rights, visibility) and events: ./service.ts.
// Errors are ItemsError codes (LOAN_*, CONTACT_*).
import { createServerFn } from '@tanstack/solid-start'
import { z } from 'zod'
import { idSchema } from '~/lib/items/inputs'
import {
	approveLoanInput,
	checkoutInput,
	handOverLoanInput,
	loanRefInput,
	requestLoanInput,
	setLoanDueInput,
} from '~/lib/loans/inputs'
import { authMiddleware } from '../auth/middleware'
import { itemsDb } from '../search/ready'
import {
	approveLoan,
	cancelLoan,
	checkoutItem,
	declineLoan,
	getItemLoans,
	getLoanOverview,
	handOverLoan,
	requestLoan,
	returnLoan,
	setLoanDue,
} from './service'

const ok = { ok: true as const }

/** ItemLoans for the item page (view). */
export const getItemLoansFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.validator(z.object({ itemId: idSchema }))
	.handler(({ context: { ctx }, data }) => getItemLoans(itemsDb(), ctx, data.itemId))

/** LoanOverview: mine, requests to decide, lent out. */
export const getLoanOverviewFn = createServerFn({ method: 'GET' })
	.middleware([authMiddleware])
	.handler(({ context: { ctx } }) => getLoanOverview(itemsDb(), ctx))

/** Use. Returns { loanId }. */
export const checkoutItemFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(checkoutInput)
	.handler(({ context: { ctx }, data }) => checkoutItem(itemsDb(), ctx, data))

/** View. Returns { loanId }. */
export const requestLoanFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(requestLoanInput)
	.handler(({ context: { ctx }, data }) => requestLoan(itemsDb(), ctx, data))

export const approveLoanFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(approveLoanInput)
	.handler(({ context: { ctx }, data }) => {
		approveLoan(itemsDb(), ctx, data)
		return ok
	})

export const declineLoanFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(loanRefInput)
	.handler(({ context: { ctx }, data }) => {
		declineLoan(itemsDb(), ctx, data)
		return ok
	})

export const cancelLoanFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(loanRefInput)
	.handler(({ context: { ctx }, data }) => {
		cancelLoan(itemsDb(), ctx, data)
		return ok
	})

export const handOverLoanFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(handOverLoanInput)
	.handler(({ context: { ctx }, data }) => {
		handOverLoan(itemsDb(), ctx, data)
		return ok
	})

export const returnLoanFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(loanRefInput)
	.handler(({ context: { ctx }, data }) => {
		returnLoan(itemsDb(), ctx, data)
		return ok
	})

export const setLoanDueFn = createServerFn({ method: 'POST' })
	.middleware([authMiddleware])
	.validator(setLoanDueInput)
	.handler(({ context: { ctx }, data }) => {
		setLoanDue(itemsDb(), ctx, data)
		return ok
	})
