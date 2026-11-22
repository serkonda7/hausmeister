// Item relations on the item page (DESIGN §4.5): grouped by role ("Passende Teile" with their stock, "Passt zu", "Zubehör" …), with add and remove.
// The server checks every rule again (src/server/relations/service.ts).
import { useQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { ItemPicker } from "~/components/item-types/pickers";
import { useItemWrite } from "~/components/items/item-actions";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { inputClass } from "~/components/ui/input";
import { formatNumber } from "~/lib/format";
import { typeIconGlyph } from "~/lib/item-types/icons";
import { statusLabel } from "~/lib/items/labels";
import { itemRelationsQuery } from "~/lib/relations/queries";
import {
  RELATION_ROLES,
  type RelationInput,
  type RelationRow,
  relationRoleChoice,
  relationRoleLabel,
  roleToken,
} from "~/lib/relations/types";
import { m } from "~/paraglide/messages";
import { addItemRelationFn, removeItemRelationFn } from "~/server/relations/functions";
import { pickItemsFn } from "~/server/search/functions";

/** The stored relation behind a row seen from `itemId`. */
const toInput = (itemId: string, r: RelationRow): RelationInput =>
  r.direction === "out"
    ? { fromItemId: itemId, toItemId: r.other.id, kind: r.kind }
    : { fromItemId: r.other.id, toItemId: itemId, kind: r.kind };

function RelatedRow(props: { itemId: string; row: RelationRow }) {
  const write = useItemWrite();
  const o = () => props.row.other;
  return (
    <li class="flex min-h-14 items-center gap-2 rounded-md px-2 py-1" data-testid="relation-row">
      <Link
        to="/items/$itemId"
        params={{ itemId: o().id }}
        class="grid min-w-0 flex-1 gap-0.5 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span class="truncate font-medium">
          <span aria-hidden="true">{typeIconGlyph(o().typeIcon)}&nbsp;</span>
          {o().name}
        </span>
        <span class="truncate text-xs text-muted-foreground">
          {[o().typeName, o().shortCode].filter(Boolean).join(" · ")}
        </span>
      </Link>
      <div class="flex shrink-0 flex-wrap items-center justify-end gap-1">
        <Show when={o().tracking === "stock" || o().minQuantity != null}>
          <span class="text-sm" data-testid="relation-stock">
            {m.relations_stock({ quantity: formatNumber(o().quantity, 3), unit: o().unit ?? "" })}
          </span>
        </Show>
        <Show when={o().lowStock}>
          <Badge variant="destructive">{m.items_low_stock_badge()}</Badge>
        </Show>
        <Show when={o().status !== "available"}>
          <Badge variant={o().gone ? "outline" : "secondary"}>{statusLabel(o().status)}</Badge>
        </Show>
        <Show when={props.row.canRemove}>
          <ConfirmButton
            label={m.relations_remove()}
            ariaLabel={m.relations_remove_label({ name: o().name })}
            question={m.relations_remove_question({
              role: relationRoleLabel(props.row.kind, props.row.direction),
              name: o().name,
            })}
            confirmLabel={m.relations_remove()}
            variant="ghost"
            onConfirm={() =>
              write(() => removeItemRelationFn({ data: toInput(props.itemId, props.row) }), {
                success: m.relations_removed_toast(),
              })
            }
          />
        </Show>
      </div>
    </li>
  );
}

function AddRelation(props: { itemId: string; itemName: string }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const [role, setRole] = createSignal(roleToken(RELATION_ROLES[0]!));
  const [other, setOther] = createSignal<string>();
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const search = (q: string) => pickItemsFn({ data: { q, excludeId: props.itemId } });

  async function submit() {
    const target = other();
    if (!target) return setError(m.relations_error_pick());
    const r = RELATION_ROLES.find((x) => roleToken(x) === role()) ?? RELATION_ROLES[0]!;
    const data: RelationInput =
      r.direction === "out"
        ? { fromItemId: props.itemId, toItemId: target, kind: r.kind }
        : { fromItemId: target, toItemId: props.itemId, kind: r.kind };
    setBusy(true);
    const done = await write(() => addItemRelationFn({ data }), {
      success: m.relations_added_toast(),
    });
    setBusy(false);
    if (done) setOpen(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOther(undefined);
          setError(undefined);
          setOpen(true);
        }}
      >
        {m.relations_add()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.relations_add_title({ name: props.itemName })}</DialogTitle>
            <DialogDescription>{m.relations_add_intro()}</DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <label for="relation-role" class="text-sm font-medium">
              {m.relations_role()}
            </label>
            <select
              id="relation-role"
              class={inputClass}
              value={role()}
              onChange={(e) => setRole(e.currentTarget.value)}
            >
              <For each={RELATION_ROLES}>
                {(r) => (
                  <option value={roleToken(r)} selected={roleToken(r) === role()}>
                    {relationRoleChoice(r.kind, r.direction)}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div class="grid gap-2">
            <label for="relation-item" class="text-sm font-medium">
              {m.relations_other()}
            </label>
            <ItemPicker
              id="relation-item"
              label={m.relations_other()}
              value={other()}
              invalid={!!error()}
              describedBy={error() ? "relation-item-error" : undefined}
              onChange={(v) => {
                setError(undefined);
                setOther(typeof v === "string" ? v : undefined);
              }}
              search={search}
            />
            <Show when={error()}>
              <p id="relation-item-error" class="text-sm text-destructive">
                {error()}
              </p>
            </Show>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button onClick={() => void submit()} disabled={busy()}>
              {m.relations_add_submit()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The "Beziehungen" section; hidden when there is nothing to show and nothing the caller may add. */
export function ItemRelationsSection(props: { itemId: string; itemName: string }) {
  const q = useQuery(() => itemRelationsQuery(props.itemId));
  const groups = createMemo(() => {
    const rows = q.data?.relations ?? [];
    return RELATION_ROLES.map((r) => ({
      ...r,
      rows: rows.filter((x) => x.kind === r.kind && x.direction === r.direction),
    })).filter((g) => g.rows.length);
  });
  return (
    <Show when={q.data && (q.data.relations.length || q.data.canAdd)}>
      <section class="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="item-relations">
        <div class="flex flex-wrap items-center gap-2">
          <h2 id="item-relations" class="mr-auto text-lg font-semibold">
            {m.relations_title()}
          </h2>
          <Show when={q.data?.canAdd}>
            <AddRelation itemId={props.itemId} itemName={props.itemName} />
          </Show>
        </div>
        <Show
          when={groups().length}
          fallback={<p class="text-sm text-muted-foreground">{m.relations_empty()}</p>}
        >
          <For each={groups()}>
            {(g) => (
              <div class="grid gap-1">
                <h3 class="text-sm font-semibold">{relationRoleLabel(g.kind, g.direction)}</h3>
                <ul class="grid gap-1" aria-label={relationRoleLabel(g.kind, g.direction)}>
                  <For each={g.rows}>{(row) => <RelatedRow itemId={props.itemId} row={row} />}</For>
                </ul>
              </div>
            )}
          </For>
        </Show>
      </section>
    </Show>
  );
}
