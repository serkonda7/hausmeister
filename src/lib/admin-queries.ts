import { queryOptions } from "@tanstack/solid-query";
import {
  adminListGroups,
  adminListInvites,
  adminListUserOptions,
  adminListUsers,
} from "~/server/admin/functions";

export const adminUsersQuery = () =>
  queryOptions({ queryKey: ["admin", "users"], queryFn: () => adminListUsers() });

export const adminUserOptionsQuery = () =>
  queryOptions({ queryKey: ["admin", "user-options"], queryFn: () => adminListUserOptions() });

export const adminInvitesQuery = () =>
  queryOptions({ queryKey: ["admin", "invites"], queryFn: () => adminListInvites() });

export const adminGroupsQuery = () =>
  queryOptions({ queryKey: ["admin", "groups"], queryFn: () => adminListGroups() });
