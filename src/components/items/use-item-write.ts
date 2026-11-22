// Kept apart from item-actions.tsx so that loan, transfer and stock widgets
// (home page, lists) can write without pulling in the item forms and pickers.
import { useQueryClient } from "@tanstack/solid-query";
import { parseItemsError } from "~/lib/items/errors";
import { runAction } from "~/lib/run-action";

/** Runs an item write; reloads the item afterwards (and on a version conflict). */
export function useItemWrite() {
  const qc = useQueryClient();
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["items"] }),
      qc.invalidateQueries({ queryKey: ["locations"] }),
    ]);
  return async <T>(
    fn: () => Promise<T>,
    opts: {
      success?: string | ((r: T) => string);
      onError?: (err: unknown) => boolean | undefined;
    } = {},
  ): Promise<T | undefined> => {
    const r = await runAction(fn, {
      success: opts.success,
      onError: (err) => {
        if (parseItemsError(err).code === "VERSION_CONFLICT") void refresh();
        return opts.onError?.(err);
      },
    });
    if (r !== undefined) await refresh();
    return r;
  };
}
