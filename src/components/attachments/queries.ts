// TanStack Query options for an item's attachments (loaders: ensureQueryData; components: useQuery).
import { queryOptions } from '@tanstack/solid-query'
import { listAttachmentsFn } from '~/server/attachments/functions'

export const attachmentsQueryKey = (itemId: string) => ['attachments', itemId] as const

export const attachmentsQuery = (itemId: string) =>
	queryOptions({
		queryKey: attachmentsQueryKey(itemId),
		queryFn: () => listAttachmentsFn({ data: { itemId } }),
	})
