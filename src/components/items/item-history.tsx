// An item's history (newest first, paged), already redacted by the server.
import { infiniteQueryOptions, useInfiniteQuery, useQuery } from "@tanstack/solid-query";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { formatDateTime } from "~/lib/format";
import type { FieldDefinition } from "~/lib/item-types/fields";
import { itemTypesQuery } from "~/lib/item-types/queries";
import { flattenTree } from "~/lib/item-types/tree";
import { formatHistoryEntry } from "~/lib/items/history-format";
import { historyActionLabel } from "~/lib/items/labels";
import type { HistoryPage } from "~/lib/items/types";
import { actionErrorText } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { getItemHistoryFn } from "~/server/history/functions";

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

export function ItemHistory(props: { itemId: string; fields: readonly FieldDefinition[] }) {
  const q = useInfiniteQuery(() => itemHistoryPagesQuery(props.itemId));
  const types = useQuery(() => itemTypesQuery());
  const typeNames = createMemo(
    () => new Map(flattenTree(types.data ?? []).map((t) => [t.id, t.name])),
  );
  const entries = createMemo(() => {
    const pages = q.data?.pages ?? [];
    const names: HistoryPage["names"] = { users: {}, groups: {}, items: {}, locations: {} };
    for (const p of pages)
      for (const k of Object.keys(names) as (keyof HistoryPage["names"])[])
        Object.assign(names[k], p.names[k]);
    return pages
      .flatMap((p) => p.entries)
      .map((e) => ({
        e,
        f: formatHistoryEntry(e, {
          names,
          fields: props.fields,
          typeName: (id) => typeNames().get(id),
        }),
      }));
  });
  return (
    <div class="grid gap-3">
      <Show when={q.isError}>
        <p role="alert" class="text-sm text-destructive">
          {actionErrorText(q.error)}
        </p>
      </Show>
      <Show when={q.isSuccess && entries().length === 0}>
        <p class="text-sm text-muted-foreground">{m.item_history_empty()}</p>
      </Show>
      <ol class="grid gap-3" aria-label={m.item_history()}>
        <For each={entries()}>
          {({ e, f }) => (
            <li class="grid gap-1 border-l-2 pl-3">
              <div class="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span class="font-medium">{historyActionLabel(e.action)}</span>
                <Show when={f.summary}>
                  <span class="break-all">{f.summary}</span>
                </Show>
              </div>
              <div class="text-xs text-muted-foreground">
                <time datetime={new Date(e.at).toISOString()}>{formatDateTime(e.at)}</time>
                {" · "}
                {e.actor?.name ?? m.history_unknown_actor()}
              </div>
              <Show when={f.lines.length}>
                <ul class="grid gap-0.5 text-sm">
                  <For each={f.lines}>
                    {(l) => (
                      <li class="break-words">
                        <span class="text-muted-foreground">{l.label}: </span>
                        <Show when={e.action !== "item.created"}>
                          <span>{l.from}</span>
                          <span aria-hidden="true"> → </span>
                          <span class="sr-only"> {m.item_history_to()} </span>
                        </Show>
                        <span class="font-medium">{l.to}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </li>
          )}
        </For>
      </ol>
      <Show when={q.hasNextPage}>
        <Button
          variant="outline"
          class="justify-self-start"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {m.item_history_more()}
        </Button>
      </Show>
    </div>
  );
}
