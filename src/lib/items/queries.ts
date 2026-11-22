// TanStack Query options for items, locations, tags, search and history
// (loaders: ensureQueryData; components: useQuery). Invalidate ["items"] after
// item writes, ["locations"] / ["tags"] after theirs.
import { infiniteQueryOptions, queryOptions } from "@tanstack/solid-query";
import { getItemHistoryFn } from "~/server/history/functions";
import { getItemFn, listItemGrantsFn, listPrincipalsFn } from "~/server/items/functions";
import { getLocationFn, listLocationsFn } from "~/server/locations/functions";
import { searchFacetsFn, searchItemsFn } from "~/server/search/functions";
import { listTagsFn } from "~/server/tags/functions";
import type { SearchFilters, SearchItemsInput } from "./inputs";
import type { HistoryPage } from "./types";

export const itemSearchQuery = (input: SearchItemsInput) =>
  queryOptions({
    queryKey: ["items", "search", input],
    queryFn: () => searchItemsFn({ data: input }),
  });

/** Paged list (keyset cursor) for "load more" / infinite scroll. Same input as itemSearchQuery minus cursor. */
export const itemListQuery = (input: Omit<SearchItemsInput, "cursor">) =>
  infiniteQueryOptions({
    queryKey: ["items", "list", input],
    queryFn: ({ pageParam }) =>
      searchItemsFn({ data: { ...input, ...(pageParam ? { cursor: pageParam } : {}) } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

export const itemFacetsQuery = (filters: SearchFilters) =>
  queryOptions({
    queryKey: ["items", "facets", filters],
    queryFn: () => searchFacetsFn({ data: filters }),
  });

export const itemQuery = (id: string) =>
  queryOptions({
    queryKey: ["items", "detail", id],
    queryFn: () => getItemFn({ data: { id } }),
  });

export const itemGrantsQuery = (itemId: string) =>
  queryOptions({
    queryKey: ["items", "grants", itemId],
    queryFn: () => listItemGrantsFn({ data: { itemId } }),
  });

/** An item's history, newest first, 20 entries per page. */
export const itemHistoryPagesQuery = (itemId: string) =>
  infiniteQueryOptions({
    queryKey: ["items", "history-pages", itemId],
    queryFn: ({ pageParam }) =>
      getItemHistoryFn({
        data: { itemId, limit: 20, ...(pageParam ? { cursor: pageParam } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: HistoryPage) => last.nextCursor,
  });

export const locationsQuery = () =>
  queryOptions({ queryKey: ["locations", "tree"], queryFn: () => listLocationsFn() });

export const locationQuery = (id: string) =>
  queryOptions({
    queryKey: ["locations", "detail", id],
    queryFn: () => getLocationFn({ data: { id } }),
  });

export const tagsQuery = () =>
  queryOptions({ queryKey: ["tags", "list"], queryFn: () => listTagsFn() });

/** Owner and grantee candidates (admin/member only). */
export const principalsQuery = () =>
  queryOptions({
    queryKey: ["items", "principals"],
    queryFn: () => listPrincipalsFn(),
    staleTime: 5 * 60_000,
  });
