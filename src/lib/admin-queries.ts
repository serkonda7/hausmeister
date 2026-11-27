import { queryOptions } from '@tanstack/solid-query'
import {
	adminListGroups,
	adminListInvites,
	adminListUserOptions,
	adminListUsers,
} from '~/server/admin/functions'
import { getSettingsFn } from '~/server/settings/functions'
import { listTagsFn } from '~/server/tags/functions'

export const adminUsersQuery = () =>
	queryOptions({ queryKey: ['admin', 'users'], queryFn: () => adminListUsers() })

export const adminUserOptionsQuery = () =>
	queryOptions({ queryKey: ['admin', 'user-options'], queryFn: () => adminListUserOptions() })

export const adminInvitesQuery = () =>
	queryOptions({ queryKey: ['admin', 'invites'], queryFn: () => adminListInvites() })

export const adminGroupsQuery = () =>
	queryOptions({ queryKey: ['admin', 'groups'], queryFn: () => adminListGroups() })

export const settingsQuery = () =>
	queryOptions({ queryKey: ['admin', 'settings'], queryFn: () => getSettingsFn() })

export const adminTagsQuery = () =>
	queryOptions({ queryKey: ['admin', 'tags'], queryFn: () => listTagsFn() })
