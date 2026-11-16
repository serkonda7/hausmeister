// Pickers for `user` and `item` fields.
import { useQuery } from "@tanstack/solid-query";
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import { Checkbox } from "~/components/ui/checkbox";
import { inputClass } from "~/components/ui/input";
import { cn } from "~/lib/cn";
import { pickerUsersQuery } from "~/lib/item-types/queries";
import { m } from "~/paraglide/messages";
import { pickItemsFn } from "~/server/search/functions";

export type PickerUser = { id: string; displayName: string };

/** Active users from the server (cached); id -> name lookup for display. */
export function usePickerUsers() {
  const q = useQuery(() => pickerUsersQuery());
  const byId = createMemo(() => new Map((q.data ?? []).map((u) => [u.id, u.displayName])));
  return { query: q, users: () => q.data ?? [], nameOf: (id: string) => byId().get(id) };
}

type BaseProps = {
  id: string;
  label: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
};

/** Single user: native select. Multiple: a checkbox per user inside a fieldset (caller renders the legend). */
export function UserPicker(
  props: BaseProps & {
    multiple?: boolean;
    value: unknown;
    onChange: (v: string | string[] | undefined) => void;
  },
) {
  const { query, users } = usePickerUsers();
  const selected = () =>
    Array.isArray(props.value)
      ? (props.value as string[])
      : typeof props.value === "string"
        ? [props.value]
        : [];
  // Keep ids of users that are no longer listed (e.g. disabled) visible and selectable.
  const unknown = () => selected().filter((id) => !users().some((u) => u.id === id));
  return (
    <>
      <Show when={query.isError}>
        <p class="text-sm text-destructive">{m.field_user_load_failed()}</p>
      </Show>
      <Show
        when={props.multiple}
        fallback={
          <select
            id={props.id}
            class={inputClass}
            aria-describedby={props.describedBy}
            aria-invalid={props.invalid || undefined}
            disabled={props.disabled}
            value={selected()[0] ?? ""}
            onChange={(e) => props.onChange(e.currentTarget.value || undefined)}
            onBlur={() => props.onBlur?.()}
          >
            <option value="">{m.field_user_none()}</option>
            <For each={unknown()}>
              {(id) => <option value={id}>{m.field_unknown_user()}</option>}
            </For>
            <For each={users()}>{(u) => <option value={u.id}>{u.displayName}</option>}</For>
          </select>
        }
      >
        <div class="grid gap-1" id={props.id}>
          <For
            each={[
              ...unknown().map((id) => ({ id, displayName: m.field_unknown_user() })),
              ...users(),
            ]}
          >
            {(u) => (
              <Checkbox
                class="min-h-11"
                label={u.displayName}
                disabled={props.disabled}
                checked={selected().includes(u.id)}
                onChange={(on: boolean) => {
                  const next = on ? [...selected(), u.id] : selected().filter((x) => x !== u.id);
                  props.onChange(next.length ? next : undefined);
                  props.onBlur?.();
                }}
              />
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

export type ItemSearchResult = { id: string; name: string };
/** Searches items the caller may see. */
export type ItemSearchFn = (query: string) => Promise<ItemSearchResult[]>;

/** The real item search (visible, not gone, max 20) via pickItemsFn. */
export const searchVisibleItems: ItemSearchFn = (q) => pickItemsFn({ data: { q } });

/** Kept under its old name: field-input.tsx uses it as the default search. */
export const searchItemsStub: ItemSearchFn = searchVisibleItems;

/**
 * Item reference picker: a search box with a result list (combobox pattern)
 * and the selection as removable chips.
 */
export function ItemPicker(
  props: BaseProps & {
    multiple?: boolean;
    value: unknown;
    onChange: (v: string | string[] | undefined) => void;
    search: ItemSearchFn;
    /** Names for ids that came from storage rather than from a search. */
    itemName?: (id: string) => string | undefined;
  },
) {
  const [text, setText] = createSignal("");
  const [results, setResults] = createSignal<ItemSearchResult[]>([]);
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  const names = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  onCleanup(() => clearTimeout(timer));

  const selected = () =>
    Array.isArray(props.value)
      ? (props.value as string[])
      : typeof props.value === "string"
        ? [props.value]
        : [];
  const nameOf = (id: string) => names.get(id) ?? props.itemName?.(id) ?? m.field_unknown_item();
  const listId = () => `${props.id}-results`;

  function runSearch(q: string) {
    clearTimeout(timer);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const mine = ++seq;
    timer = setTimeout(async () => {
      const r = await props.search(q.trim()).catch(() => []);
      if (mine !== seq) return;
      for (const it of r) names.set(it.id, it.name);
      setResults(r.filter((it) => !selected().includes(it.id)));
      setActive(0);
      setOpen(true);
    }, 200);
  }

  function pick(it: ItemSearchResult) {
    names.set(it.id, it.name);
    props.onChange(props.multiple ? [...selected(), it.id] : it.id);
    setText("");
    setResults([]);
    setOpen(false);
  }

  function remove(id: string) {
    const next = selected().filter((x) => x !== id);
    props.onChange(props.multiple ? (next.length ? next : undefined) : undefined);
    props.onBlur?.();
  }

  return (
    <div class="grid gap-2">
      <Show when={selected().length}>
        <ul class="flex flex-wrap gap-2">
          <For each={selected()}>
            {(id) => (
              <li class="inline-flex items-center gap-1 rounded-full border bg-secondary py-1 pl-3 pr-1 text-sm">
                {nameOf(id)}
                <button
                  type="button"
                  class="flex size-8 items-center justify-center rounded-full hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={m.field_item_remove({ name: nameOf(id) })}
                  disabled={props.disabled}
                  onClick={() => remove(id)}
                >
                  ✕
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={props.multiple || selected().length === 0}>
        <div class="relative">
          <input
            id={props.id}
            type="search"
            role="combobox"
            autocomplete="off"
            class={inputClass}
            placeholder={m.field_item_search()}
            aria-autocomplete="list"
            aria-expanded={open()}
            aria-controls={listId()}
            aria-activedescendant={
              open() && results().length ? `${listId()}-${active()}` : undefined
            }
            aria-describedby={props.describedBy}
            aria-invalid={props.invalid || undefined}
            disabled={props.disabled}
            value={text()}
            onInput={(e) => {
              setText(e.currentTarget.value);
              runSearch(e.currentTarget.value);
            }}
            onKeyDown={(e) => {
              const r = results();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(a + 1, r.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && open() && r[active()]) {
                e.preventDefault();
                pick(r[active()]!);
              } else if (e.key === "Escape") setOpen(false);
            }}
            onBlur={() => {
              setTimeout(() => setOpen(false), 150);
              props.onBlur?.();
            }}
          />
          <Show when={open() && text().trim().length >= 2}>
            <div
              id={listId()}
              role="listbox"
              aria-label={props.label}
              class="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
            >
              <Show
                when={results().length}
                fallback={
                  <p class="px-2 py-2 text-sm text-muted-foreground">{m.field_item_no_results()}</p>
                }
              >
                <For each={results()}>
                  {(it, i) => (
                    // Keyboard selection runs through the combobox input (aria-activedescendant).
                    // biome-ignore lint/a11y/useKeyWithClickEvents: see above
                    <div
                      id={`${listId()}-${i()}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={i() === active()}
                      class={cn(
                        "flex min-h-11 cursor-pointer items-center rounded-sm px-2 text-base",
                        i() === active() && "bg-accent",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(it)}
                    >
                      {it.name}
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </div>
        <p class="text-xs text-muted-foreground">{m.field_item_search_hint()}</p>
      </Show>
    </div>
  );
}
