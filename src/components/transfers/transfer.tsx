// Ownership transfers in the UI (DESIGN §3.6): "Übergeben …" on the item page (manage), the pending offer on the item page, and offer cards for the loans page and home.
// The server checks every rule again.
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { useItemWrite } from "~/components/items/item-actions";
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
import { Textarea } from "~/components/ui/textarea";
import { formatDate } from "~/lib/format";
import { typeIconGlyph } from "~/lib/item-types/icons";
import { principalsQuery } from "~/lib/items/queries";
import type { ItemDetail } from "~/lib/items/types";
import { itemTransferQuery } from "~/lib/transfers/queries";
import type { TransferListRow, TransferRow } from "~/lib/transfers/types";
import { m } from "~/paraglide/messages";
import type { SessionUser } from "~/server/auth/functions";
import {
  acceptTransferFn,
  cancelTransferFn,
  declineTransferFn,
  forceTransferFn,
  startTransferFn,
} from "~/server/transfers/functions";

function useTransferWrite() {
  const write = useItemWrite();
  const qc = useQueryClient();
  return async <T,>(fn: () => Promise<T>, success: string) => {
    const r = await write(fn, { success });
    if (r !== undefined) void qc.invalidateQueries({ queryKey: ["notifications"] });
    return r;
  };
}

/** Manage: offer the item to another user or group. Hidden while an offer is pending. */
export function TransferAction(props: { detail: ItemDetail; user: SessionUser }) {
  const write = useTransferWrite();
  const pending = useQuery(() => itemTransferQuery(props.detail.item.id));
  const people = useQuery(() => principalsQuery());
  const [open, setOpen] = createSignal(false);
  const [target, setTarget] = createSignal("");
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const options = createMemo(() => {
    const d = props.detail;
    const direct = d.permissions.canChangeOwner;
    const cur = `${d.owner.kind}:${d.owner.id}`;
    const out: { token: string; label: string }[] = [];
    for (const u of people.data?.users ?? [])
      if (u.role !== "guest" && `user:${u.id}` !== cur && (direct || u.id !== props.user.id))
        out.push({ token: `user:${u.id}`, label: u.displayName });
    for (const g of people.data?.groups ?? [])
      if (`group:${g.id}` !== cur && (direct || !g.member))
        out.push({ token: `group:${g.id}`, label: m.item_owner_group({ name: g.name }) });
    return out;
  });

  async function submit() {
    const t = target();
    if (!t) return setError(m.transfers_error_pick());
    const i = t.indexOf(":");
    setBusy(true);
    const r = await write(
      () =>
        startTransferFn({
          data: {
            itemId: props.detail.item.id,
            to: { ownerKind: t.slice(0, i) as "user" | "group", ownerId: t.slice(i + 1) },
            note: note().trim() || null,
          },
        }),
      m.transfers_started_toast(),
    );
    setBusy(false);
    if (r) setOpen(false);
  }

  return (
    <Show when={pending.isSuccess && !pending.data}>
      <Button
        variant="outline"
        onClick={() => {
          setTarget("");
          setNote("");
          setError(undefined);
          setOpen(true);
        }}
      >
        {m.transfers_action_start()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.transfers_start_title({ name: props.detail.item.name })}</DialogTitle>
            <DialogDescription>{m.transfers_start_intro()}</DialogDescription>
          </DialogHeader>
          <div class="grid gap-2">
            <label for="transfer-to" class="text-sm font-medium">
              {m.transfers_to()}
            </label>
            <select
              id="transfer-to"
              class={inputClass}
              value={target()}
              aria-invalid={error() ? true : undefined}
              aria-describedby={error() ? "transfer-to-error" : undefined}
              onChange={(e) => setTarget(e.currentTarget.value)}
            >
              <option value="" selected={!target()}>
                {m.transfers_pick()}
              </option>
              <For each={options()}>
                {(o) => (
                  <option value={o.token} selected={o.token === target()}>
                    {o.label}
                  </option>
                )}
              </For>
            </select>
            <Show when={error()}>
              <p id="transfer-to-error" class="text-sm text-destructive">
                {error()}
              </p>
            </Show>
          </div>
          <div class="grid gap-2">
            <label for="transfer-note" class="text-sm font-medium">
              {m.transfers_note()}
            </label>
            <Textarea
              id="transfer-note"
              rows={2}
              maxLength={500}
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button disabled={busy()} onClick={submit}>
              {m.transfers_action_start_confirm()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Show>
  );
}

function TransferButtons(props: { t: TransferRow; itemName: string }) {
  const write = useTransferWrite();
  const a = () => props.t.actions;
  const data = () => ({ data: { transferId: props.t.id } });
  return (
    <div class="flex flex-wrap gap-2">
      <Show when={a().accept}>
        <Button
          size="sm"
          onClick={() =>
            void write(
              () => acceptTransferFn(data()),
              m.transfers_accepted_toast({ name: props.itemName }),
            )
          }
        >
          {m.transfers_action_accept()}
        </Button>
      </Show>
      <Show when={a().decline}>
        <ConfirmButton
          label={m.transfers_action_decline()}
          question={m.transfers_decline_question({ name: props.itemName })}
          onConfirm={() => write(() => declineTransferFn(data()), m.transfers_declined_toast())}
        />
      </Show>
      <Show when={a().cancel}>
        <ConfirmButton
          label={m.transfers_action_cancel()}
          question={m.transfers_cancel_question({ name: props.itemName })}
          onConfirm={() => write(() => cancelTransferFn(data()), m.transfers_cancelled_toast())}
        />
      </Show>
      <Show when={a().force}>
        <ConfirmButton
          label={m.transfers_action_force()}
          question={m.transfers_force_question({ name: props.itemName, to: props.t.to.name })}
          onConfirm={() =>
            write(
              () => forceTransferFn(data()),
              m.transfers_accepted_toast({ name: props.itemName }),
            )
          }
        />
      </Show>
    </div>
  );
}

function TransferBody(props: { t: TransferRow; itemName: string; title?: JSX.Element }) {
  return (
    <>
      <Show when={props.title}>{props.title}</Show>
      <p class="break-words">
        {props.t.toMe
          ? m.transfers_offer_to_me({
              from: props.t.createdBy?.name ?? props.t.from.name,
              date: formatDate(props.t.createdAt),
            })
          : m.transfers_offer_to({
              to: props.t.to.name,
              date: formatDate(props.t.createdAt),
            })}
      </p>
      <Show when={props.t.note}>
        <p class="whitespace-pre-line break-words text-sm text-muted-foreground">{props.t.note}</p>
      </Show>
      <TransferButtons t={props.t} itemName={props.itemName} />
    </>
  );
}

/** The item's pending offer (managers, the starter and the new owner see it). */
export function TransferBanner(props: { itemId: string; itemName: string }) {
  const q = useQuery(() => itemTransferQuery(props.itemId));
  return (
    <Show when={q.data}>
      {(t) => (
        <section
          class="grid gap-2 rounded-lg border border-primary bg-card p-4"
          aria-labelledby="item-transfer"
          data-testid="transfer"
        >
          <h2 id="item-transfer" class="text-lg font-semibold">
            {m.transfers_pending_title()}
          </h2>
          <TransferBody t={t()} itemName={props.itemName} />
        </section>
      )}
    </Show>
  );
}

/** An offer in the overview, with its item (linked when visible). */
export function TransferCard(props: { t: TransferListRow }) {
  const it = () => props.t.item;
  return (
    <li class="grid gap-2 rounded-md border p-3" data-testid="transfer">
      <TransferBody
        t={props.t}
        itemName={it().name}
        title={
          <p class="font-medium">
            <span aria-hidden="true">{typeIconGlyph(it().typeIcon)} </span>
            <Show when={it().visible} fallback={<span>{it().name}</span>}>
              <Link
                to="/items/$itemId"
                params={{ itemId: it().id }}
                class="underline-offset-4 hover:underline"
              >
                {it().name}
              </Link>
            </Show>
          </p>
        }
      />
    </li>
  );
}
