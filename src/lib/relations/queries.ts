// Query options for item relations; keys under ["items", …] so item writes refresh them.
import { queryOptions } from '@tanstack/solid-query'
import { listItemRelationsFn } from '~/server/relations/functions'

export const itemRelationsQuery = (itemId: string) =>
	queryOptions({
		queryKey: ['items', 'relations', itemId],
		queryFn: () => listItemRelationsFn({ data: { itemId } }),
	})
