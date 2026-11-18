// Shelf mode (DESIGN §5.2): scan books in a row; each ISBN becomes a filled-in
// item of the chosen type, at the chosen place and owner. Books already in
// the inventory are flagged instead of added twice ("add anyway" is one tap);
// a book the libraries don't know, or that misses a required field, gets a
// link to quick add with the ISBN prefilled. Each new book can be undone.
// Items are created one after the other, in scan order.
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createFileRoute, Link, notFound } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { z } from "zod";
import { LocationPicker, type Placement, placementInput } from "~/components/items/location-picker";
import { OwnerSelect, type OwnerValue } from "~/components/items/owner-picker";
import { CameraScanner, useScanSupport } from "~/components/scan/camera-scanner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import { useHydrated } from "~/lib/hydrated";
import { toIsbn13 } from "~/lib/isbn";
import { activeFields, type FieldDefinition, normalizeIsbn } from "~/lib/item-types/fields";
import { itemTypeQuery, itemTypesQuery } from "~/lib/item-types/queries";
import { flattenTree } from "~/lib/item-types/tree";
import { parseItemsError } from "~/lib/items/errors";
import { locationsQuery, principalsQuery } from "~/lib/items/queries";
import { actionErrorText } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { lookupBookFn } from "~/server/isbn/functions";
import { createItemFn, deleteItemFn } from "~/server/items/functions";
import { lookupCodeFn } from "~/server/scan/functions";

const searchSchema = z.object({
  type: z.string().max(64).optional().catch(undefined),
  loc: z.string().max(64).optional().catch(undefined),
});

export const Route = createFileRoute("/_authed/items/shelf")({
  validateSearch: searchSchema,
  beforeLoad: ({ context }) => {
    if (context.user.role === "guest") throw notFound();
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(itemTypesQuery(false)),
      context.queryClient.ensureQueryData(locationsQuery()),
      context.queryClient.ensureQueryData(principalsQuery()),
    ]),
  head: () => ({ meta: [{ title: `${m.shelf_title()} · ${m.app_name()}` }] }),
  component: ShelfPage,
});

type Entry = {
  isbn: string;
  state: "working" | "created" | "exists" | "needs_input" | "error" | "undone";
  title?: string;
  itemId?: string;
  version?: number;
  existing?: { id: string; name: string }[];
  message?: string;
};

function ShelfPage() {
  const ctx = Route.useRouteContext();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const hydrated = useHydrated();
  const support = useScanSupport();
  const types = useQuery(() => itemTypesQuery(false));
  const flat = createMemo(() => flattenTree(types.data ?? []));
  const [typeId, setTypeId] = createSignal(
    search().type ?? flattenTree(types.data ?? []).find((t) => t.key === "book")?.id ?? "",
  );
  const type = useQuery(() => ({ ...itemTypeQuery(typeId()), enabled: !!typeId() }));
  const hasIsbn = () =>
    activeFields(type.data?.effectiveFields ?? []).some((f: FieldDefinition) => f.kind === "isbn");
  const [owner, setOwner] = createSignal<OwnerValue>({ ownerKind: "household", ownerId: null });
  const [place, setPlace] = createSignal<Placement>({
    locationId: search().loc ?? null,
    containerItemId: null,
  });
  const [entries, setEntries] = createStore<Entry[]>([]);
  const [typed, setTyped] = createSignal("");
  const [notice, setNotice] = createSignal<string>();
  let queue: Promise<void> = Promise.resolve();

  const created = () => entries.filter((e) => e.state === "created").length;
  const update = (isbn: string, patch: Partial<Entry>) => setEntries((e) => e.isbn === isbn, patch);

  async function create(isbn: string, force: boolean) {
    const tid = typeId();
    update(isbn, { state: "working", message: undefined });
    try {
      if (!force) {
        const found = await lookupCodeFn({ data: { code: isbn } });
        if (found.kind === "matches" && found.items.length) {
          update(isbn, {
            state: "exists",
            existing: found.items.map((i) => ({ id: i.id, name: i.name })),
          });
          return;
        }
      }
      const book = await lookupBookFn({ data: { isbn, typeId: tid } });
      if (book.status !== "found") {
        update(isbn, {
          state: "needs_input",
          message: book.status === "not_found" ? m.isbn_not_found() : m.isbn_unavailable(),
        });
        return;
      }
      update(isbn, { title: book.name });
      const r = await createItemFn({
        data: {
          typeId: tid,
          name: book.name,
          attributes: book.attributes,
          owner: owner(),
          ...placementInput(place()),
        },
      });
      update(isbn, { state: "created", itemId: r.id, version: r.version });
      void qc.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      const code = parseItemsError(err).code;
      update(isbn, {
        state: code === "ATTRIBUTES_INVALID" ? "needs_input" : "error",
        message: code === "ATTRIBUTES_INVALID" ? m.shelf_missing_fields() : actionErrorText(err),
      });
    }
  }

  function add(raw: string) {
    const isbn = toIsbn13(normalizeIsbn(raw));
    if (!isbn) {
      setNotice(m.shelf_not_isbn({ code: raw.trim() }));
      return;
    }
    if (entries.some((e) => e.isbn === isbn && e.state !== "undone")) {
      setNotice(m.shelf_already_scanned());
      return;
    }
    setNotice(undefined);
    setEntries((list) => [{ isbn, state: "working" }, ...list.filter((e) => e.isbn !== isbn)]);
    queue = queue.then(() => create(isbn, false));
  }

  async function undo(e: Entry) {
    if (!e.itemId || !e.version) return;
    try {
      await deleteItemFn({ data: { id: e.itemId, version: e.version } });
      update(e.isbn, { state: "undone" });
      void qc.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      update(e.isbn, { message: actionErrorText(err) });
    }
  }

  const ready = () => hydrated() && !!typeId() && hasIsbn();

  return (
    <div class="grid gap-4">
      <div class="grid gap-1">
        <h1 class="text-2xl font-semibold">{m.shelf_title()}</h1>
        <p class="text-sm text-muted-foreground">{m.shelf_intro()}</p>
      </div>

      <div class="grid gap-4 rounded-lg border bg-card p-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="grid content-start gap-2">
            <label for="shelf-type" class="text-sm font-medium">
              {m.item_field_type()}
            </label>
            <select
              id="shelf-type"
              class={inputClass}
              value={typeId()}
              disabled={!hydrated()}
              onChange={(e) => setTypeId(e.currentTarget.value)}
            >
              <For each={flat()}>
                {(t) => (
                  <option value={t.id} selected={t.id === typeId()}>
                    {"  ".repeat(t.depth)}
                    {t.name}
                  </option>
                )}
              </For>
            </select>
            <Show when={type.data && !hasIsbn()}>
              <p class="text-sm text-destructive">{m.shelf_type_no_isbn()}</p>
            </Show>
          </div>
          <div class="grid content-start gap-2">
            <label for="shelf-owner" class="text-sm font-medium">
              {m.item_field_owner()}
            </label>
            <OwnerSelect
              id="shelf-owner"
              user={ctx().user}
              value={owner()}
              onChange={setOwner}
              disabled={!hydrated()}
            />
          </div>
        </div>
        <LocationPicker id="shelf-place" value={place()} onChange={setPlace} />
      </div>

      <Show when={ready() && support() === "yes"}>
        <CameraScanner paused={false} onCode={add} />
      </Show>
      <form
        class="grid gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          add(typed());
          setTyped("");
        }}
      >
        <label for="shelf-isbn" class="text-sm font-medium">
          {m.shelf_typed_label()}
        </label>
        <div class="flex gap-2">
          <input
            id="shelf-isbn"
            class={`${inputClass} font-mono`}
            inputmode="numeric"
            autocomplete="off"
            value={typed()}
            disabled={!ready()}
            onInput={(e) => setTyped(e.currentTarget.value)}
          />
          <Button type="submit" disabled={!ready()}>
            {m.shelf_add()}
          </Button>
        </div>
      </form>
      <Show when={notice()}>
        <p role="status" class="text-sm text-destructive">
          {notice()}
        </p>
      </Show>

      <section class="grid gap-2" aria-labelledby="shelf-list-h">
        <h2 id="shelf-list-h" class="text-lg font-semibold">
          {m.shelf_list({ count: created() })}
        </h2>
        <Show
          when={entries.length}
          fallback={<p class="text-sm text-muted-foreground">{m.shelf_list_empty()}</p>}
        >
          <ul class="grid gap-2" aria-live="polite">
            <For each={entries}>
              {(e) => (
                <li class="grid gap-1 rounded-md border p-3" data-testid="shelf-entry">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="min-w-0 flex-1 break-words">
                      <Show
                        when={e.itemId && e.state === "created"}
                        fallback={<span>{e.title ?? e.isbn}</span>}
                      >
                        <Link
                          to="/items/$itemId"
                          params={{ itemId: e.itemId ?? "" }}
                          class="font-medium underline-offset-4 hover:underline"
                        >
                          {e.title}
                        </Link>
                      </Show>
                    </span>
                    <Badge
                      variant={
                        e.state === "created"
                          ? "default"
                          : e.state === "working" || e.state === "undone"
                            ? "outline"
                            : "destructive"
                      }
                    >
                      {{
                        working: m.shelf_state_working,
                        created: m.shelf_state_created,
                        exists: m.shelf_state_exists,
                        needs_input: m.shelf_state_needs_input,
                        error: m.shelf_state_error,
                        undone: m.shelf_state_undone,
                      }[e.state]()}
                    </Badge>
                  </div>
                  <span class="font-mono text-xs text-muted-foreground">{e.isbn}</span>
                  <Show when={e.message}>
                    <p class="text-sm text-muted-foreground">{e.message}</p>
                  </Show>
                  <Show when={e.state === "exists"}>
                    <p class="text-sm">
                      {m.shelf_exists_as()}{" "}
                      <For each={e.existing}>
                        {(x, i) => (
                          <>
                            {i() > 0 ? ", " : ""}
                            <Link
                              to="/items/$itemId"
                              params={{ itemId: x.id }}
                              class="text-primary underline-offset-4 hover:underline"
                            >
                              {x.name}
                            </Link>
                          </>
                        )}
                      </For>
                    </p>
                  </Show>
                  <div class="flex flex-wrap gap-2">
                    <Show when={e.state === "exists"}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          queue = queue.then(() => create(e.isbn, true));
                        }}
                      >
                        {m.shelf_add_anyway()}
                      </Button>
                    </Show>
                    <Show when={e.state === "needs_input" || e.state === "error"}>
                      <Link
                        to="/items/new"
                        search={{
                          type: typeId(),
                          isbn: e.isbn,
                          ...(place().locationId ? { loc: place().locationId ?? undefined } : {}),
                        }}
                        class="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {m.shelf_open_quick_add()}
                      </Link>
                    </Show>
                    <Show when={e.state === "created"}>
                      <Button size="sm" variant="ghost" onClick={() => void undo(e)}>
                        {m.shelf_undo()}
                      </Button>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
