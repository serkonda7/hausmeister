// The loan section of the item page: who has it, open requests, and "Ausleihen" (use: hand it out now) or "Ausleihe anfragen" (view: ask the owner).
// Reads itemLoansQuery; the loader warms it.
import { useQuery } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { useItemWrite } from "~/components/items/use-item-write";
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
import { formatNumber, parseDecimalDe } from "~/lib/format";
import { principalsQuery } from "~/lib/items/queries";
import type { ItemDetail } from "~/lib/items/types";
import type { BorrowerInput } from "~/lib/loans/inputs";
import { contactsQuery, itemLoansQuery } from "~/lib/loans/queries";
import type { ItemLoans } from "~/lib/loans/types";
import { runAction } from "~/lib/run-action";
import { m } from "~/paraglide/messages";
import type { SessionUser } from "~/server/auth/functions";
import { createContactFn } from "~/server/contacts/functions";
import { checkoutItemFn, requestLoanFn } from "~/server/loans/functions";
import { DueField, LoanCard, useLoanWrite } from "./loan-actions";

export function ItemLoansSection(props: { detail: ItemDetail; user: SessionUser }) {
  const q = useQuery(() => itemLoansQuery(props.detail.item.id));
  const it = () => props.detail.item;
  const stock = () => q.data?.tracking === "stock";
  return (
    <Show when={q.data}>
      {(l) => (
        <Show when={l().open.length || l().canCheckout || l().canRequest}>
          <section class="grid gap-3 rounded-lg border bg-card p-4" aria-labelledby="item-loans">
            <div class="flex flex-wrap items-center gap-2">
              <h2 id="item-loans" class="mr-auto text-lg font-semibold">
                {m.loans_section()}
              </h2>
              <Show when={l().canCheckout && l().available > 0}>
                <CheckoutDialog detail={props.detail} loans={l()} user={props.user} />
              </Show>
              <Show when={!l().canCheckout && l().canRequest}>
                <RequestDialog detail={props.detail} loans={l()} />
              </Show>
            </div>
            <Show when={stock()}>
              <p class="text-sm text-muted-foreground" data-testid="loan-available">
                {m.loans_available({
                  n: formatNumber(l().available, 3),
                  unit: it().unit ?? "",
                })}
              </p>
            </Show>
            <Show
              when={l().open.length}
              fallback={<p class="text-sm text-muted-foreground">{m.loans_none_open()}</p>}
            >
              <ul class="grid gap-2">
                <For each={l().open}>
                  {(loan) => (
                    <LoanCard loan={loan} itemName={it().name} stock={stock()} unit={it().unit} />
                  )}
                </For>
              </ul>
            </Show>
          </section>
        </Show>
      )}
    </Show>
  );
}

function QuantityField(props: {
  id: string;
  value: string;
  onInput: (v: string) => void;
  max: number;
  unit: string | null;
  error?: string;
}) {
  return (
    <div class="grid gap-2">
      <label for={props.id} class="text-sm font-medium">
        {m.loans_quantity()}
        <Show when={props.unit}> ({props.unit})</Show>
      </label>
      <input
        id={props.id}
        class={inputClass}
        inputmode="decimal"
        autocomplete="off"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={`${props.id}-hint`}
      />
      <p
        id={`${props.id}-hint`}
        class={props.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {props.error ?? m.loans_quantity_max({ n: formatNumber(props.max, 3) })}
      </p>
    </div>
  );
}

/** Parses the quantity field; undefined for individual items. */
function parseQuantity(stock: boolean, raw: string, max: number): number | undefined | null {
  if (!stock) return undefined;
  const n = parseDecimalDe(raw);
  return n === null || n <= 0 || n > max ? null : n;
}

function CheckoutDialog(props: { detail: ItemDetail; loans: ItemLoans; user: SessionUser }) {
  const write = useLoanWrite();
  const [open, setOpen] = createSignal(false);
  const [who, setWho] = createSignal<"me" | "user" | "contact">("me");
  const [userId, setUserId] = createSignal("");
  const [contactId, setContactId] = createSignal("");
  const [newContact, setNewContact] = createSignal("");
  const [due, setDue] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const others = () => props.loans.canLendToOthers;
  const people = useQuery(() => ({ ...principalsQuery(), enabled: open() && others() }));
  const contacts = useQuery(() => ({ ...contactsQuery(), enabled: open() && others() }));
  const stock = () => props.loans.tracking === "stock";

  function reset() {
    setWho("me");
    setUserId("");
    setContactId("");
    setNewContact("");
    setDue("");
    setQty("1");
    setNote("");
    setError(undefined);
  }

  async function borrower(): Promise<BorrowerInput | undefined | null> {
    if (who() === "me") return undefined;
    if (who() === "user") return userId() ? { kind: "user", id: userId() } : null;
    if (contactId() && contactId() !== "new") return { kind: "contact", id: contactId() };
    const name = newContact().trim();
    if (!name) return null;
    const c = await runAction(() => createContactFn({ data: { name } }));
    if (!c) return null;
    setContactId(c.id);
    return { kind: "contact", id: c.id };
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const quantity = parseQuantity(stock(), qty(), props.loans.available);
    if (quantity === null) return setError(m.loans_error_quantity());
    setError(undefined);
    setBusy(true);
    const b = await borrower();
    if (b === null) {
      setBusy(false);
      return setError(m.loans_error_pick_borrower());
    }
    const it = props.detail.item;
    const r = await write(
      () =>
        checkoutItemFn({
          data: {
            itemId: it.id,
            ...(b ? { borrower: b } : {}),
            ...(quantity !== undefined ? { quantity } : {}),
            dueOn: due() || null,
            note: note().trim() || null,
          },
        }),
      m.loans_lent_toast({ name: it.name }),
    );
    setBusy(false);
    if (r) setOpen(false);
  }

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {m.loans_action_checkout()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.loans_checkout_title({ name: props.detail.item.name })}</DialogTitle>
          </DialogHeader>
          <form id="checkout-form" class="grid gap-4" noValidate onSubmit={submit}>
            <Show when={others()}>
              <fieldset class="grid gap-1">
                <legend class="mb-1 text-sm font-medium">{m.loans_borrower()}</legend>
                <label class="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="checkout-who"
                    class="size-4 accent-primary"
                    checked={who() === "me"}
                    onChange={() => setWho("me")}
                  />
                  {m.loans_borrower_me()}
                </label>
                <label class="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="checkout-who"
                    class="size-4 accent-primary"
                    checked={who() === "user"}
                    onChange={() => setWho("user")}
                  />
                  {m.loans_borrower_user()}
                </label>
                <label class="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="checkout-who"
                    class="size-4 accent-primary"
                    checked={who() === "contact"}
                    onChange={() => setWho("contact")}
                  />
                  {m.loans_borrower_contact()}
                </label>
              </fieldset>
              <Show when={who() === "user"}>
                <div class="grid gap-2">
                  <label for="checkout-user" class="text-sm font-medium">
                    {m.loans_which_person()}
                  </label>
                  <select
                    id="checkout-user"
                    class={inputClass}
                    value={userId()}
                    onChange={(e) => setUserId(e.currentTarget.value)}
                  >
                    <option value="" selected={!userId()}>
                      {m.loans_pick_person()}
                    </option>
                    <For each={(people.data?.users ?? []).filter((u) => u.id !== props.user.id)}>
                      {(u) => (
                        <option value={u.id} selected={u.id === userId()}>
                          {u.displayName}
                        </option>
                      )}
                    </For>
                  </select>
                </div>
              </Show>
              <Show when={who() === "contact"}>
                <div class="grid gap-2">
                  <label for="checkout-contact" class="text-sm font-medium">
                    {m.loans_which_contact()}
                  </label>
                  <select
                    id="checkout-contact"
                    class={inputClass}
                    value={contactId()}
                    onChange={(e) => setContactId(e.currentTarget.value)}
                  >
                    <option value="" selected={!contactId()}>
                      {m.loans_pick_contact()}
                    </option>
                    <For each={contacts.data ?? []}>
                      {(c) => (
                        <option value={c.id} selected={c.id === contactId()}>
                          {c.name}
                        </option>
                      )}
                    </For>
                    <option value="new" selected={contactId() === "new"}>
                      {m.loans_new_contact()}
                    </option>
                  </select>
                  <Show when={contactId() === "new" || (contacts.data?.length ?? 0) === 0}>
                    <label for="checkout-new-contact" class="text-sm font-medium">
                      {m.contacts_field_name()}
                    </label>
                    <input
                      id="checkout-new-contact"
                      class={inputClass}
                      maxLength={100}
                      autocomplete="off"
                      value={newContact()}
                      onInput={(e) => {
                        setNewContact(e.currentTarget.value);
                        setContactId("new");
                      }}
                    />
                  </Show>
                </div>
              </Show>
            </Show>
            <Show when={stock()}>
              <QuantityField
                id="checkout-qty"
                value={qty()}
                onInput={setQty}
                max={props.loans.available}
                unit={props.detail.item.unit}
              />
            </Show>
            <DueField id="checkout-due" value={due()} onInput={setDue} />
            <div class="grid gap-2">
              <label for="checkout-note" class="text-sm font-medium">
                {m.loans_note()}
              </label>
              <Textarea
                id="checkout-note"
                rows={2}
                maxLength={500}
                value={note()}
                onInput={(e) => setNote(e.currentTarget.value)}
              />
            </div>
            <Show when={error()}>
              <p role="alert" class="text-sm text-destructive">
                {error()}
              </p>
            </Show>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" form="checkout-form" disabled={busy()}>
              {m.loans_action_checkout_confirm()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestDialog(props: { detail: ItemDetail; loans: ItemLoans }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const [due, setDue] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  const stock = () => props.loans.tracking === "stock";

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const quantity = parseQuantity(stock(), qty(), props.detail.item.quantity);
    if (quantity === null) return setError(m.loans_error_quantity());
    setError(undefined);
    setBusy(true);
    const r = await write(
      () =>
        requestLoanFn({
          data: {
            itemId: props.detail.item.id,
            ...(quantity !== undefined ? { quantity } : {}),
            dueOn: due() || null,
            note: note().trim() || null,
          },
        }),
      { success: m.loans_requested_toast() },
    );
    setBusy(false);
    if (r) setOpen(false);
  }

  return (
    <>
      <Button
        onClick={() => {
          setDue("");
          setQty("1");
          setNote("");
          setError(undefined);
          setOpen(true);
        }}
      >
        {m.loans_action_request()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.loans_request_title({ name: props.detail.item.name })}</DialogTitle>
            <DialogDescription>
              {m.loans_request_intro({ owner: props.detail.owner.name })}
            </DialogDescription>
          </DialogHeader>
          <form id="request-form" class="grid gap-4" noValidate onSubmit={submit}>
            <Show when={stock()}>
              <QuantityField
                id="request-qty"
                value={qty()}
                onInput={setQty}
                max={props.detail.item.quantity}
                unit={props.detail.item.unit}
                error={error()}
              />
            </Show>
            <DueField id="request-due" value={due()} onInput={setDue} label={m.loans_due_until()} />
            <div class="grid gap-2">
              <label for="request-note" class="text-sm font-medium">
                {m.loans_request_note()}
              </label>
              <Textarea
                id="request-note"
                rows={2}
                maxLength={500}
                value={note()}
                onInput={(e) => setNote(e.currentTarget.value)}
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" form="request-form" disabled={busy()}>
              {m.loans_action_request_confirm()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
