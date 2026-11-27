// Query options for loans and contacts.
// Loan keys live under ["items", …], so every item write (useItemWrite invalidates ["items"]) refreshes them too.
import { queryOptions } from '@tanstack/solid-query'
import { listContactsFn } from '~/server/contacts/functions'
import { getItemLoansFn, getLoanOverviewFn } from '~/server/loans/functions'

export const itemLoansQuery = (itemId: string) =>
	queryOptions({
		queryKey: ['items', 'loans', itemId],
		queryFn: () => getItemLoansFn({ data: { itemId } }),
	})

export const loanOverviewQuery = () =>
	queryOptions({ queryKey: ['items', 'loan-overview'], queryFn: () => getLoanOverviewFn() })

/** Admin/member only. */
export const contactsQuery = () =>
	queryOptions({ queryKey: ['contacts'], queryFn: () => listContactsFn() })
