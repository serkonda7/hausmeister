// An item's history (newest first, paged), already redacted by the server.
import { useInfiniteQuery, useQuery } from "@tanstack/solid-query";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { formatDateTime } from "~/lib/format";
import type { FieldDefinition } from "~/lib/item-types/fields";
import { itemTypesQuery } from "~/lib/item-types/queries";
import { flattenTree } from "~/lib/item-types/tree";
import { formatHistoryEntry, groupFileRuns, type HistoryLine } from "~/lib/items/history-format";
import { historyActionLabel } from "~/lib/items/labels";
import { itemHistoryPagesQuery } from "~/lib/items/queries";
import type { HistoryEntry, HistoryPage } from "~/lib/items/types";
import { actionErrorText } from "~/lib/run-action";
import { m } from "~/paraglide/messages";

function HistoryLines(props: { e: HistoryEntry; lines: HistoryLine[] }) {
  return (
    <ul class="grid gap-0.5 text-sm">
      <For each={props.lines}>
        {(l) => (
          <li class="break-words">
            <span class="text-muted-foreground">{l.label}: </span>
            <Show when={props.e.action !== "item.created" && l.from !== ""}>
              <span>{l.from}</span>
              <span aria-hidden="true"> → </span>
              <span class="sr-only"> {m.item_history_to()} </span>
            </Show>
            <span class="font-medium">{l.to}</span>
          </li>
        )}
      </For>
    </ul>
  );
}

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
    const list = pages
      .flatMap((p) => p.entries)
      .map((e) => ({
        e,
        f: formatHistoryEntry(e, {
          names,
          fields: props.fields,
          typeName: (id) => typeNames().get(id),
        }),
      }));
    return groupFileRuns(list);
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
                <Show when={f.collapsed} fallback={<HistoryLines e={e} lines={f.lines} />}>
                  <details class="text-sm">
                    <summary class="min-h-8 cursor-pointer text-muted-foreground">
                      {f.detailsLabel ?? m.item_history_initial_values({ count: f.lines.length })}
                    </summary>
                    <HistoryLines e={e} lines={f.lines} />
                  </details>
                </Show>
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
