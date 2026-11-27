// Query options for transfers; keys under ["items", …] so item writes refresh them.
import { queryOptions } from '@tanstack/solid-query'
import { getItemTransferFn, getTransferOverviewFn } from '~/server/transfers/functions'

export const itemTransferQuery = (itemId: string) =>
	queryOptions({
		queryKey: ['items', 'transfer', itemId],
		queryFn: () => getItemTransferFn({ data: { itemId } }),
	})

export const transferOverviewQuery = () =>
	queryOptions({
		queryKey: ['items', 'transfer-overview'],
		queryFn: () => getTransferOverviewFn(),
	})
