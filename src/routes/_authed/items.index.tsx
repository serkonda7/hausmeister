// The items list: search, filters, sort, grid/list, keyset paging. All of it
// lives in the URL (src/lib/items/list-search.ts) so views can be bookmarked.
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { ItemResults } from "~/components/items/item-card";
import { ActiveFilterChips, ItemFilterSheet } from "~/components/items/item-filters";
import { buttonVariants } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import { cn } from "~/lib/cn";
import { ITEM_SORTS, type ItemSort } from "~/lib/items/constants";
import {
  activeFilterCount,
  defaultSort,
  type ItemsSearch,
  parseItemsSearch,
  patchSearch,
  toSearchFilters,
  toSearchInput,
} from "~/lib/items/list-search";
import { itemFacetsQuery, itemListQuery } from "~/lib/items/queries";
import { m } from "~/paraglide/messages";

export const Route = createFileRoute("/_authed/items/")({
  validateSearch: (raw: Record<string, unknown>): ItemsSearch => parseItemsSearch(raw),
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ context, deps }) => {
    const { view: _v, ...s } = deps.search;
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(itemListQuery(toSearchInput(s))),
      context.queryClient.ensureQueryData(itemFacetsQuery(toSearchFilters(s))),
    ]);
  },
  head: () => ({ meta: [{ title: `${m.nav_items()} · ${m.app_name()}` }] }),
  component: ItemsPage,
});

const SORT_LABEL: Record<ItemSort, () => string> = {
  relevance: m.items_sort_relevance,
  name_asc: m.items_sort_name_asc,
  name_desc: m.items_sort_name_desc,
  updated_desc: m.items_sort_updated_desc,
  updated_asc: m.items_sort_updated_asc,
  created_desc: m.items_sort_created_desc,
  created_asc: m.items_sort_created_asc,
  price_asc: m.items_sort_price_asc,
  price_desc: m.items_sort_price_desc,
};

function ItemsPage() {
  const ctx = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/items/" });
  const facets = useQuery(() => itemFacetsQuery(toSearchFilters(search())));
  const [total, setTotal] = createSignal<number>();
  const isGuest = () => ctx().user.role === "guest";

  const go = (next: ItemsSearch, replace = false) =>
    navigate({ search: next as never, replace, resetScroll: false });

  // Search box: typed text goes to the URL after a short pause (replace, so
  // back does not step through every keystroke); Enter applies at once.
  const [text, setText] = createSignal(search().q ?? "");
  createEffect(
    on(
      () => search().q,
      (q) => setText(q ?? ""),
      { defer: true },
    ),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const applyText = (replace: boolean) => {
    clearTimeout(timer);
    const q = text().trim();
    if (q === (search().q ?? "")) return;
    const s = patchSearch(search(), { q: q || undefined });
    if (s.sort === "relevance" && !q) s.sort = undefined;
    void go(s, replace);
  };

  const sorts = () =>
    ITEM_SORTS.filter(
      (s) =>
        (s !== "relevance" || !!search().q) &&
        (!s.startsWith("price_") || facets.data?.priceAvailable || search().sort === s),
    );
  const sort = () => search().sort ?? defaultSort(search());
  const view = () => search().view ?? "grid";
  const filtered = () => !!search().q || activeFilterCount(search()) > 0;

  return (
    // grid-cols-1 caps the track at the viewport: the sort select's intrinsic
    // width would otherwise widen the whole page on a phone.
    <div class="grid grid-cols-1 gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="mr-auto text-2xl font-semibold">{m.nav_items()}</h1>
        <Show when={!isGuest()}>
          <Link
            to="/items/new"
            search={search().loc ? { loc: search().loc } : {}}
            class={buttonVariants({ variant: "default" })}
          >
            + {m.items_add()}
          </Link>
        </Show>
      </div>

      <form
        class="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applyText(false);
        }}
      >
        <label for="items-q" class="sr-only">
          {m.items_search_label()}
        </label>
        <input
          id="items-q"
          type="search"
          class={inputClass}
          placeholder={m.items_search_placeholder()}
          enterkeyhint="search"
          autocomplete="off"
          value={text()}
          onInput={(e) => {
            setText(e.currentTarget.value);
            clearTimeout(timer);
            timer = setTimeout(() => applyText(true), 350);
          }}
        />
        <button type="submit" class={buttonVariants({ variant: "secondary" })}>
          {m.items_search_submit()}
        </button>
      </form>

      <div class="flex items-center gap-2">
        <ItemFilterSheet
          search={search()}
          facets={facets.data}
          onChange={(s) => void go(s, true)}
          showOwnership={!isGuest()}
          total={total()}
        />
        <label for="items-sort" class="sr-only">
          {m.items_sort_label()}
        </label>
        <select
          id="items-sort"
          class={cn(inputClass, "w-auto min-w-0 flex-1 sm:max-w-[14rem] sm:flex-none")}
          value={sort()}
          onChange={(e) =>
            void go(patchSearch(search(), { sort: e.currentTarget.value as ItemSort }), true)
          }
        >
          <For each={sorts()}>
            {(s) => (
              <option value={s} selected={s === sort()}>
                {SORT_LABEL[s]()}
              </option>
            )}
          </For>
        </select>
        {/* biome-ignore lint/a11y/useSemanticElements: a button group, not a form fieldset */}
        <div
          class="ml-auto flex shrink-0 rounded-md border"
          role="group"
          aria-label={m.items_view_label()}
        >
          <For each={["grid", "list"] as const}>
            {(v) => (
              <button
                type="button"
                class={cn(
                  "flex h-11 min-w-11 items-center justify-center px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring first:rounded-l-md last:rounded-r-md",
                  view() === v ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
                aria-pressed={view() === v}
                onClick={() => void go(patchSearch(search(), { view: v }), true)}
              >
                <span aria-hidden="true">{v === "grid" ? "▦" : "☰"}</span>
                <span class="sr-only">
                  {v === "grid" ? m.items_view_grid() : m.items_view_list()}
                </span>
              </button>
            )}
          </For>
        </div>
      </div>

      <ActiveFilterChips
        search={search()}
        facets={facets.data}
        onChange={(s) => void go(s, true)}
        showOwnership={!isGuest()}
      />

      <ItemResults
        input={toSearchInput(search())}
        view={view()}
        label={m.items_results()}
        showCount
        onTotal={setTotal}
        empty={
          <div class="grid justify-items-start gap-2 rounded-lg border border-dashed p-6">
            <Show
              when={filtered()}
              fallback={
                <>
                  <p class="font-medium">{isGuest() ? m.items_empty_guest() : m.items_empty()}</p>
                  <Show when={!isGuest()}>
                    <Link to="/items/new" class={buttonVariants({ variant: "default" })}>
                      + {m.items_add_first()}
                    </Link>
                  </Show>
                </>
              }
            >
              <p class="font-medium">{m.items_no_results()}</p>
              <p class="text-sm text-muted-foreground">{m.items_no_results_hint()}</p>
              <Show when={activeFilterCount(search()) > 0}>
                <button
                  type="button"
                  class={buttonVariants({ variant: "outline" })}
                  onClick={() => void go({ q: search().q })}
                >
                  {m.items_filter_reset()}
                </button>
              </Show>
            </Show>
          </div>
        }
      />
    </div>
  );
}
