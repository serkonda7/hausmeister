// TanStack Query options for item types (loaders: ensureQueryData; components: useQuery).
import { queryOptions } from "@tanstack/solid-query";
import { getItemTypeFn, listItemTypesFn, listPickerUsersFn } from "~/server/item-types/functions";

export const itemTypesQuery = (includeArchived = true) =>
  queryOptions({
    queryKey: ["item-types", "list", { includeArchived }],
    queryFn: () => listItemTypesFn({ data: { includeArchived } }),
  });

export const itemTypeQuery = (id: string) =>
  queryOptions({
    queryKey: ["item-types", "detail", id],
    queryFn: () => getItemTypeFn({ data: { id } }),
  });

export const pickerUsersQuery = () =>
  queryOptions({
    queryKey: ["item-types", "picker-users"],
    queryFn: () => listPickerUsersFn(),
    staleTime: 5 * 60_000,
  });
