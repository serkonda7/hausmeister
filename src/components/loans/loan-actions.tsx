// One loan with the actions the caller may take (LoanRow.actions): approve,
// decline, hand over, return, withdraw, change the due date. Used on the
// item page and the loans overview.
import { useQueryClient } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { createSignal, type JSX, Show } from "solid-js";
import { ConfirmButton } from "~/components/confirm-dialog";
import { useItemWrite } from "~/components/items/item-actions";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { inputClass } from "~/components/ui/input";
import { formatIsoDay, isoDayInBerlin } from "~/lib/format";
import { typeIconGlyph } from "~/lib/item-types/icons";
import { loanStatusLabel, loanSummary } from "~/lib/loans/labels";
import type { LoanListRow, LoanRow } from "~/lib/loans/types";
import { m } from "~/paraglide/messages";
import {
  approveLoanFn,
  cancelLoanFn,
  declineLoanFn,
  handOverLoanFn,
  returnLoanFn,
  setLoanDueFn,
} from "~/server/loans/functions";

/** useItemWrite plus the inbox (loan answers notify people). */
export function useLoanWrite() {
  const write = useItemWrite();
  const qc = useQueryClient();
  return async <T,>(fn: () => Promise<T>, success: string) => {
    const r = await write(fn, { success });
    if (r !== undefined) void qc.invalidateQueries({ queryKey: ["notifications"] });
    return r;
  };
}

/** A date field for due dates ('YYYY-MM-DD'; empty = none). */
export function DueField(props: {
  id: string;
  value: string;
  onInput: (v: string) => void;
  label?: string;
}) {
  return (
    <div class="grid gap-2">
      <label for={props.id} class="text-sm font-medium">
        {props.label ?? m.loans_due_label()}
      </label>
      <input
        id={props.id}
        type="date"
        class={inputClass}
        min={isoDayInBerlin()}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        aria-describedby={`${props.id}-hint`}
      />
      <p id={`${props.id}-hint`} class="text-sm text-muted-foreground">
        {m.loans_due_hint()}
      </p>
    </div>
  );
}

function DueDialog(props: { loan: LoanRow }) {
  const write = useLoanWrite();
  const [open, setOpen] = createSignal(false);
  const [due, setDue] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  async function save() {
    setBusy(true);
    const r = await write(
      () => setLoanDueFn({ data: { loanId: props.loan.id, dueOn: due() || null } }),
      m.loans_due_saved(),
    );
    setBusy(false);
    if (r) setOpen(false);
  }
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setDue(props.loan.dueOn ?? "");
          setOpen(true);
        }}
      >
        {m.loans_action_due()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.loans_action_due()}</DialogTitle>
          </DialogHeader>
          <DueField id={`due-${props.loan.id}`} value={due()} onInput={setDue} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button disabled={busy()} onClick={save}>
              {m.common_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LoanActionButtons(props: { loan: LoanRow; itemName: string }) {
  const write = useLoanWrite();
  const a = () => props.loan.actions;
  const id = () => props.loan.id;
  return (
    <div class="flex flex-wrap gap-2">
      <Show when={a().approve}>
        <Button
          size="sm"
          onClick={() =>
            void write(
              () => approveLoanFn({ data: { loanId: id(), handOver: true } }),
              m.loans_lent_toast({ name: props.itemName }),
            )
          }
        >
          {m.loans_action_approve_hand_over()}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void write(() => approveLoanFn({ data: { loanId: id() } }), m.loans_approved_toast())
          }
        >
          {m.loans_action_approve()}
        </Button>
      </Show>
      <Show when={a().handOver}>
        <Button
          size="sm"
          onClick={() =>
            void write(
              () => handOverLoanFn({ data: { loanId: id() } }),
              m.loans_lent_toast({ name: props.itemName }),
            )
          }
        >
          {props.loan.mine ? m.loans_action_picked_up() : m.loans_action_hand_over()}
        </Button>
      </Show>
      <Show when={a().return}>
        <Button
          size="sm"
          onClick={() =>
            void write(
              () => returnLoanFn({ data: { loanId: id() } }),
              m.loans_returned_toast({ name: props.itemName }),
            )
          }
        >
          {m.loans_action_return()}
        </Button>
      </Show>
      <Show when={a().decline}>
        <ConfirmButton
          label={m.loans_action_decline()}
          question={m.loans_decline_question({ name: props.loan.borrower.name })}
          onConfirm={() =>
            write(() => declineLoanFn({ data: { loanId: id() } }), m.loans_declined_toast())
          }
        />
      </Show>
      <Show when={a().cancel}>
        <ConfirmButton
          label={m.loans_action_cancel()}
          question={m.loans_cancel_question({ name: props.itemName })}
          onConfirm={() =>
            write(() => cancelLoanFn({ data: { loanId: id() } }), m.loans_cancelled_toast())
          }
        />
      </Show>
      <Show when={a().changeDue}>
        <DueDialog loan={props.loan} />
      </Show>
    </div>
  );
}

/** A loan as a card: who, how much, until when, status, note, actions. */
export function LoanCard(props: {
  loan: LoanRow;
  itemName: string;
  title?: JSX.Element;
  stock?: boolean;
  unit?: string | null;
}) {
  const l = () => props.loan;
  return (
    <li class="grid gap-2 rounded-md border p-3" data-testid="loan">
      <Show when={props.title}>{props.title}</Show>
      <div class="flex flex-wrap items-center gap-2">
        <span class="min-w-0 flex-1 break-words">
          {loanSummary(l(), { stock: props.stock, unit: props.unit })}
        </span>
        <Badge variant={l().overdue ? "destructive" : l().status === "out" ? "default" : "outline"}>
          {l().overdue ? m.loans_overdue() : loanStatusLabel(l().status)}
        </Badge>
      </div>
      <Show when={l().note}>
        <p class="whitespace-pre-line break-words text-sm text-muted-foreground">{l().note}</p>
      </Show>
      <Show when={l().requestedBy && l().status === "requested" && !l().mine}>
        <p class="text-sm text-muted-foreground">
          {m.loans_requested_at({
            date: formatIsoDay(isoDayInBerlin(l().createdAt)),
          })}
        </p>
      </Show>
      <LoanActionButtons loan={l()} itemName={props.itemName} />
    </li>
  );
}

/** A loan of the overview, with a link to its item (when visible). */
export function LoanListCard(props: { loan: LoanListRow }) {
  const it = () => props.loan.item;
  return (
    <LoanCard
      loan={props.loan}
      itemName={it().name}
      stock={props.loan.quantity !== 1}
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
  );
}
