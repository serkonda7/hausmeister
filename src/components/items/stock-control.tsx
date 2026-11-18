// Stock on the item page and in scan results (DESIGN §4.2, §9): the quantity, the minimum, quick −1 / +1 and a dialog for amounts and counts.
// Needs `use` (ItemDetail.permissions.canUse).
// Stock changes need no version.
import { createSignal, For, Show } from "solid-js";
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
import { formatNumber, parseDecimalDe } from "~/lib/format";
import { STOCK_ADJUST_REASONS } from "~/lib/items/constants";
import { stockReasonLabel } from "~/lib/items/labels";
import { m } from "~/paraglide/messages";
import { adjustStockFn } from "~/server/stock/functions";
import { useItemWrite } from "./item-actions";

type StockItem = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  minQuantity: number | null;
};

const qty = (n: number, unit: string | null) => `${formatNumber(n, 3)}${unit ? ` ${unit}` : ""}`;

export function StockControl(props: { item: StockItem; canUse: boolean; compact?: boolean }) {
  const write = useItemWrite();
  const [busy, setBusy] = createSignal(false);
  const low = () => props.item.minQuantity !== null && props.item.quantity < props.item.minQuantity;

  async function step(delta: number) {
    setBusy(true);
    const wasLow = low();
    await write(
      () =>
        adjustStockFn({
          data: { id: props.item.id, delta, reason: delta < 0 ? "used" : "restocked" },
        }),
      { success: (r) => (r.lowStock && !wasLow ? m.stock_became_low() : "") },
    );
    setBusy(false);
  }

  return (
    <div class="grid gap-2" data-testid="stock-control">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p class="text-2xl font-semibold tabular-nums" aria-live="polite" data-testid="stock-qty">
          <span class="sr-only">{m.stock_current()}: </span>
          {qty(props.item.quantity, props.item.unit)}
        </p>
        <Show when={props.item.minQuantity !== null}>
          <span class="text-sm text-muted-foreground">
            {m.item_min_quantity_short({ n: formatNumber(props.item.minQuantity ?? 0, 3) })}
          </span>
        </Show>
        <Show when={low()}>
          <Badge variant="destructive">{m.items_low_stock_badge()}</Badge>
        </Show>
      </div>
      <Show when={props.canUse}>
        <div class="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size={props.compact ? "default" : "lg"}
            disabled={busy() || props.item.quantity < 1}
            aria-label={m.stock_take_one({ name: props.item.name })}
            onClick={() => void step(-1)}
          >
            −1
          </Button>
          <Button
            variant="outline"
            size={props.compact ? "default" : "lg"}
            disabled={busy()}
            aria-label={m.stock_add_one({ name: props.item.name })}
            onClick={() => void step(1)}
          >
            +1
          </Button>
          <StockDialog item={props.item} />
        </div>
      </Show>
    </div>
  );
}

function StockDialog(props: { item: StockItem }) {
  const write = useItemWrite();
  const [open, setOpen] = createSignal(false);
  const [reason, setReason] = createSignal<(typeof STOCK_ADJUST_REASONS)[number]>("used");
  const [amount, setAmount] = createSignal("");
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);

  const amountLabel = () =>
    reason() === "counted"
      ? m.stock_amount_counted()
      : reason() === "used"
        ? m.stock_amount_used()
        : m.stock_amount_added();

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const n = parseDecimalDe(amount());
    if (n === null || n < 0 || (reason() !== "counted" && n === 0)) {
      setError(m.stock_error_amount());
      document.getElementById("stock-amount")?.focus();
      return;
    }
    setError(undefined);
    setBusy(true);
    const r = await write(
      () =>
        adjustStockFn({
          data: {
            id: props.item.id,
            reason: reason(),
            note: note().trim() || null,
            ...(reason() === "counted" ? { quantity: n } : { delta: reason() === "used" ? -n : n }),
          },
        }),
      { success: m.stock_saved() },
    );
    setBusy(false);
    if (r) setOpen(false);
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setReason("used");
          setAmount("");
          setNote("");
          setError(undefined);
          setOpen(true);
        }}
      >
        {m.stock_adjust()}
      </Button>
      <Dialog open={open()} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.stock_adjust_title({ name: props.item.name })}</DialogTitle>
          </DialogHeader>
          <form id="stock-form" class="grid gap-4" noValidate onSubmit={submit}>
            <fieldset class="grid gap-1">
              <legend class="mb-1 text-sm font-medium">{m.stock_reason()}</legend>
              <For each={STOCK_ADJUST_REASONS}>
                {(r) => (
                  <label class="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="stock-reason"
                      class="size-4 accent-primary"
                      checked={reason() === r}
                      onChange={() => setReason(r)}
                    />
                    {stockReasonLabel(r)}
                  </label>
                )}
              </For>
            </fieldset>
            <div class="grid gap-2">
              <label for="stock-amount" class="text-sm font-medium">
                {amountLabel()}
                <Show when={props.item.unit}> ({props.item.unit})</Show>
              </label>
              <input
                id="stock-amount"
                class={inputClass}
                inputmode="decimal"
                autocomplete="off"
                value={amount()}
                onInput={(e) => setAmount(e.currentTarget.value)}
                aria-invalid={error() ? true : undefined}
                aria-describedby={error() ? "stock-amount-error" : "stock-amount-hint"}
              />
              <Show
                when={error()}
                fallback={
                  <p id="stock-amount-hint" class="text-sm text-muted-foreground">
                    {m.stock_now({ quantity: qty(props.item.quantity, props.item.unit) })}
                  </p>
                }
              >
                <p id="stock-amount-error" class="text-sm text-destructive">
                  {error()}
                </p>
              </Show>
            </div>
            <div class="grid gap-2">
              <label for="stock-note" class="text-sm font-medium">
                {m.stock_note()}
              </label>
              <input
                id="stock-note"
                class={inputClass}
                maxLength={200}
                value={note()}
                onInput={(e) => setNote(e.currentTarget.value)}
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {m.common_cancel()}
            </Button>
            <Button type="submit" form="stock-form" disabled={busy()}>
              {m.common_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
