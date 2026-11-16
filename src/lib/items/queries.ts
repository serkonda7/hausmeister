// TanStack Query options for items, locations, tags, search and history
// (loaders: ensureQueryData; components: useQuery). Invalidate ["items"] after
// item writes, ["locations"] / ["tags"] after theirs.
import { queryOptions } from "@tanstack/solid-query";
import { getItemHistoryFn } from "~/server/history/functions";
import { getItemFn, listItemGrantsFn } from "~/server/items/functions";
import { getLocationFn, listLocationsFn } from "~/server/locations/functions";
import { searchFacetsFn, searchItemsFn } from "~/server/search/functions";
import { listTagsFn } from "~/server/tags/functions";
import type { SearchFilters, SearchItemsInput } from "./inputs";

export const itemSearchQuery = (input: SearchItemsInput) =>
  queryOptions({
    queryKey: ["items", "search", input],
    queryFn: () => searchItemsFn({ data: input }),
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

export const itemHistoryQuery = (itemId: string, cursor?: string) =>
  queryOptions({
    queryKey: ["items", "history", itemId, cursor ?? null],
    queryFn: () => getItemHistoryFn({ data: { itemId, cursor } }),
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
