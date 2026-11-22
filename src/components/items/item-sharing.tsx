// "Teilen": an item's grants for users and groups (manage only). The server
// caps guests at `use` (GRANT_ABOVE_CEILING) and validates principals.
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/components/ui/input";
import { cn } from "~/lib/cn";
import { GRANT_LEVELS } from "~/lib/items/constants";
import { levelLabel } from "~/lib/items/labels";
import { principalsQuery } from "~/lib/items/queries";
import type { GrantRow, OwnerRef } from "~/lib/items/types";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import { removeItemGrantFn, setItemGrantFn } from "~/server/items/functions";

type Level = (typeof GRANT_LEVELS)[number];
const GUEST_LEVELS: readonly Level[] = ["view", "use"];

export function ItemSharing(props: {
  itemId: string;
  itemName: string;
  grants: GrantRow[];
  owner: OwnerRef;
  meId: string;
}) {
  const qc = useQueryClient();
  const principals = useQuery(() => principalsQuery());
  const [target, setTarget] = createSignal("");
  const [level, setLevel] = createSignal<Level>("view");
  const [busy, setBusy] = createSignal(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["items"] });
  const isGuestToken = (t: string) =>
    t.startsWith("user:") &&
    principals.data?.users.find((u) => `user:${u.id}` === t)?.role === "guest";

  const candidates = createMemo(() => {
    const taken = new Set(props.grants.map((g) => `${g.principalKind}:${g.principalId}`));
    const ownerToken =
      props.owner.kind === "household" ? "" : `${props.owner.kind}:${props.owner.id}`;
    const groups = (principals.data?.groups ?? [])
      .map((g) => ({ token: `group:${g.id}`, label: m.item_owner_group({ name: g.name }) }))
      .filter((o) => !taken.has(o.token) && o.token !== ownerToken);
    const users = (principals.data?.users ?? [])
      .filter((u) => u.id !== props.meId)
      .map((u) => ({
        token: `user:${u.id}`,
        label: u.role === "guest" ? m.item_share_guest({ name: u.displayName }) : u.displayName,
      }))
      .filter((o) => !taken.has(o.token) && o.token !== ownerToken);
    return { groups, users };
  });
  const levelsFor = (guest: boolean) => (guest ? GUEST_LEVELS : GRANT_LEVELS);

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const t = target();
    if (!t) return;
    const [kind, id] = [t.slice(0, t.indexOf(":")), t.slice(t.indexOf(":") + 1)];
    setBusy(true);
    const r = await runAction(
      () =>
        setItemGrantFn({
          data: {
            itemId: props.itemId,
            principalKind: kind as "user" | "group",
            principalId: id,
            level: level(),
          },
        }),
      { success: m.item_share_added() },
    );
    setBusy(false);
    if (r) {
      setTarget("");
      setLevel("view");
      await refresh();
    }
  }

  async function change(g: GrantRow, l: Level) {
    await runAction(
      () =>
        setItemGrantFn({
          data: {
            itemId: props.itemId,
            principalKind: g.principalKind,
            principalId: g.principalId,
            level: l,
          },
        }),
      { success: m.item_share_changed() },
    );
    await refresh();
  }

  async function remove(g: GrantRow) {
    await runAction(
      () =>
        removeItemGrantFn({
          data: {
            itemId: props.itemId,
            principalKind: g.principalKind,
            principalId: g.principalId,
          },
        }),
      { success: m.item_share_removed({ name: g.name }) },
    );
    await refresh();
  }

  return (
    <div class="grid gap-4">
      <p class="text-sm text-muted-foreground">{m.item_share_intro()}</p>
      <Show
        when={props.grants.length}
        fallback={<p class="text-sm text-muted-foreground">{m.item_share_none()}</p>}
      >
        <ul class="grid gap-2" aria-label={m.item_share_list()}>
          <For each={props.grants}>
            {(g) => (
              <li class="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span class="min-w-0 flex-1 break-words">
                  {g.principalKind === "group" ? m.item_owner_group({ name: g.name }) : g.name}
                  <Show when={g.isGuest}>
                    <span class="text-xs text-muted-foreground"> · {m.role_guest()}</span>
                  </Show>
                </span>
                <select
                  class={cn(inputClass, "h-9 w-auto")}
                  aria-label={m.item_share_level_for({ name: g.name })}
                  value={g.level}
                  onChange={(e) => void change(g, e.currentTarget.value as Level)}
                >
                  <For each={levelsFor(g.isGuest)}>
                    {(l) => (
                      <option value={l} selected={l === g.level}>
                        {levelLabel(l)}
                      </option>
                    )}
                  </For>
                </select>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={m.item_share_remove_for({ name: g.name })}
                  onClick={() => void remove(g)}
                >
                  {m.item_share_remove()}
                </Button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <form class="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end" onSubmit={add}>
        <div class="grid gap-2">
          <label for={`share-${props.itemId}-who`} class="text-sm font-medium">
            {m.item_share_with()}
          </label>
          <select
            id={`share-${props.itemId}-who`}
            class={inputClass}
            value={target()}
            onChange={(e) => {
              const t = e.currentTarget.value;
              setTarget(t);
              if (isGuestToken(t) && !GUEST_LEVELS.includes(level())) setLevel("use");
            }}
            required
          >
            <option value="">{m.item_share_pick()}</option>
            <Show when={candidates().groups.length}>
              <optgroup label={m.item_share_groups()}>
                <For each={candidates().groups}>
                  {(o) => (
                    <option value={o.token} selected={o.token === target()}>
                      {o.label}
                    </option>
                  )}
                </For>
              </optgroup>
            </Show>
            <Show when={candidates().users.length}>
              <optgroup label={m.item_share_people()}>
                <For each={candidates().users}>
                  {(o) => (
                    <option value={o.token} selected={o.token === target()}>
                      {o.label}
                    </option>
                  )}
                </For>
              </optgroup>
            </Show>
          </select>
        </div>
        <div class="grid gap-2">
          <label for={`share-${props.itemId}-level`} class="text-sm font-medium">
            {m.item_share_level()}
          </label>
          <select
            id={`share-${props.itemId}-level`}
            class={inputClass}
            value={level()}
            onChange={(e) => setLevel(e.currentTarget.value as Level)}
          >
            <For each={levelsFor(isGuestToken(target()))}>
              {(l) => (
                <option value={l} selected={l === level()}>
                  {levelLabel(l)}
                </option>
              )}
            </For>
          </select>
        </div>
        <Button type="submit" disabled={busy() || !target()}>
          {m.item_share_add()}
        </Button>
      </form>
      <Show when={isGuestToken(target())}>
        <p class="text-sm text-muted-foreground">{m.items_error_grant_above_ceiling()}</p>
      </Show>
    </div>
  );
}
