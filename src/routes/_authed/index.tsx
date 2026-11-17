// Home: search, quick add, my items, recently changed, low stock (if any).
// Scan, loans and requests come in later phases (DESIGN §10).
import { useQuery } from "@tanstack/solid-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router";
import { createSignal, type JSX, Show } from "solid-js";
import { ItemResults } from "~/components/items/item-card";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import type { SearchItemsInput } from "~/lib/items/inputs";
import { itemListQuery } from "~/lib/items/queries";
import { roleLabel } from "~/lib/labels";
import { myProfileQuery } from "~/lib/session-query";
import { m } from "~/paraglide/messages";

const MINE: SearchItemsInput = { mine: true, sort: "updated_desc", limit: 6 };
const RECENT: SearchItemsInput = { sort: "updated_desc", limit: 6 };
const LOW: SearchItemsInput = { lowStock: true, sort: "name_asc", limit: 6 };

export const Route = createFileRoute("/_authed/")({
  // Loader warms the Query cache (SSR-dehydrated); the component reads via useQuery.
  loader: ({ context }) => {
    const qc = context.queryClient;
    const lists = context.user?.role === "guest" ? [RECENT, LOW] : [MINE, RECENT, LOW];
    return Promise.all([
      qc.ensureQueryData(myProfileQuery()),
      ...lists.map((i) => qc.ensureInfiniteQueryData(itemListQuery(i))),
    ]);
  },
  component: Home,
});

function Teaser(props: {
  id: string;
  title: string;
  more?: JSX.Element;
  input: SearchItemsInput;
  empty: JSX.Element;
  hideWhenEmpty?: boolean;
}) {
  const [total, setTotal] = createSignal<number>();
  return (
    <section
      class="grid gap-3"
      aria-labelledby={props.id}
      hidden={props.hideWhenEmpty && total() === 0}
    >
      <div class="flex flex-wrap items-baseline gap-2">
        <h2 id={props.id} class="mr-auto text-lg font-semibold">
          {props.title}
        </h2>
        <Show when={(total() ?? 0) > 0}>{props.more}</Show>
      </div>
      <ItemResults
        input={props.input}
        view="list"
        label={props.title}
        firstPageOnly
        onTotal={setTotal}
        empty={props.empty}
      />
    </section>
  );
}

const moreLink = (search: Record<string, unknown>, label: string) => (
  <Link
    to="/items"
    search={search as never}
    class="text-sm text-primary underline-offset-4 hover:underline"
  >
    {label}
  </Link>
);

function Home() {
  const ctx = Route.useRouteContext();
  const navigate = useNavigate();
  const profile = useQuery(() => myProfileQuery());
  const isGuest = () => ctx().user.role === "guest";
  const [q, setQ] = createSignal("");

  return (
    <div class="grid gap-6">
      <div class="grid gap-1">
        <h1 class="text-2xl font-semibold">{m.home_greeting({ name: ctx().user.displayName })}</h1>
        <Show when={profile.data}>
          {(p) => (
            <div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary">{m.home_role({ role: roleLabel(p().role) })}</Badge>
              <span>
                {p().groups.length
                  ? m.home_groups({ groups: p().groups.join(", ") })
                  : m.home_no_groups()}
              </span>
            </div>
          )}
        </Show>
      </div>

      <form
        class="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const text = q().trim();
          void navigate({ to: "/items", search: (text ? { q: text } : {}) as never });
        }}
      >
        <label for="home-q" class="text-sm font-medium">
          {m.home_search_label()}
        </label>
        <div class="flex gap-2">
          <input
            id="home-q"
            type="search"
            class={`${inputClass} h-12 text-lg`}
            placeholder={m.items_search_placeholder()}
            enterkeyhint="search"
            autocomplete="off"
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
          <Button type="submit" size="lg">
            {m.items_search_submit()}
          </Button>
        </div>
      </form>

      <Show when={!isGuest()}>
        <Link to="/items/new" class={buttonVariants({ size: "lg", class: "w-full sm:w-auto" })}>
          + {m.home_quick_add()}
        </Link>
      </Show>

      <Teaser
        id="home-low"
        title={m.home_low_stock()}
        input={LOW}
        hideWhenEmpty
        more={moreLink({ low: true }, m.home_show_all())}
        empty={null}
      />

      <Show when={!isGuest()}>
        <Teaser
          id="home-mine"
          title={m.home_my_items()}
          input={MINE}
          more={moreLink({ mine: true, sort: "updated_desc" }, m.home_show_all())}
          empty={<p class="text-sm text-muted-foreground">{m.home_my_items_empty()}</p>}
        />
      </Show>

      <Teaser
        id="home-recent"
        title={isGuest() ? m.home_shared_with_me() : m.home_recent()}
        input={RECENT}
        more={moreLink({ sort: "updated_desc" }, m.home_show_all())}
        empty={
          <p class="text-sm text-muted-foreground">
            {isGuest() ? m.home_shared_empty() : m.home_recent_empty()}
          </p>
        }
      />
    </div>
  );
}
