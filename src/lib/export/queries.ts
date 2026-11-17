import { queryOptions } from "@tanstack/solid-query";
import { getExportInfoFn } from "~/server/export/functions";

/** The export page's data; poll it (refetchInterval) while an export runs. */
export const exportInfoQuery = () =>
  queryOptions({ queryKey: ["export", "info"], queryFn: () => getExportInfoFn() });
