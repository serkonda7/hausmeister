import { queryOptions } from "@tanstack/solid-query";
import { getMyProfile, getSessionUser, listMyPasskeys } from "~/server/auth/functions";

/** The signed-in user (or null). Invalidate after sign-in/out. */
export const sessionQuery = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: () => getSessionUser(),
    staleTime: 60_000,
  });

/** Role and group names of the signed-in user. */
export const myProfileQuery = () =>
  queryOptions({
    queryKey: ["me", "profile"],
    queryFn: () => getMyProfile(),
  });

/** The signed-in user's passkeys (account page). */
export const myPasskeysQuery = () =>
  queryOptions({
    queryKey: ["me", "passkeys"],
    queryFn: () => listMyPasskeys(),
  });
