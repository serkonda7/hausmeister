// Query options for the inbox (key ["notifications", …]). Invalidate it after
// writes that may notify the caller or change what they read.
import { infiniteQueryOptions, queryOptions } from "@tanstack/solid-query";
import { listNotificationsFn, unreadNotificationsFn } from "~/server/notifications/functions";

export const unreadNotificationsQuery = () =>
  queryOptions({
    queryKey: ["notifications", "unread"],
    queryFn: () => unreadNotificationsFn(),
    refetchInterval: 120_000,
  });

export const notificationsQuery = () =>
  infiniteQueryOptions({
    queryKey: ["notifications", "list"],
    queryFn: ({ pageParam }) =>
      listNotificationsFn({ data: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
