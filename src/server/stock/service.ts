// Stock (DESIGN §4.2, §5.6): adjustments at `use` (used up, restocked, counted), the stock ledger (stock_moves) and low-stock alerts.
// An item is low on stock when min_quantity is set and quantity is below it, the same rule as the list's lowStock filter.
// Falling below the minimum notifies the item's owners (ownerAudience) once; climbing back withdraws unread notices.
// Stock changes add up, so adjustments need no version (two phones taking one screw each both count); the item's version still goes up.

import type { StockReason } from "../../lib/items/constants";
import { type AdjustStockInput, adjustStockInput } from "../../lib/items/inputs";
import type { AuthCtx } from "../authz/ctx";
import type { AppDb, DbOrTx } from "../db/client";
import { type Item, stockMoves } from "../db/schema";
import { recordItemEvent } from "../history/record";
import { requireItem, writeVersioned } from "../items/access";
import { ItemsError, parseInput } from "../items/errors";
import { notify, ownerAudience, withdrawNotices } from "../notifications/service";

type StockState = { quantity: number; minQuantity: number | null };

export const isLowStock = (s: StockState) => s.minQuantity !== null && s.quantity < s.minQuantity;

/** Rounds away float noise (0.1 + 0.2) at six decimals. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Records a quantity or minimum change made by any write path: a ledger row when the quantity changed, and the low-stock notice when the item just became low (withdrawn when it no longer is).
 * Call inside the transaction.
 */
export function recordStockChange(
  tx: DbOrTx,
  ctx: AuthCtx,
  item: Pick<Item, "id" | "ownerKind" | "ownerId" | "unit">,
  before: StockState,
  after: StockState,
  reason: StockReason,
  note: string | null = null,
) {
  if (after.quantity !== before.quantity)
    tx.insert(stockMoves)
      .values({
        itemId: item.id,
        delta: round(after.quantity - before.quantity),
        quantityAfter: after.quantity,
        reason,
        note,
        userId: ctx.userId,
      })
      .run();
  const wasLow = isLowStock(before);
  const nowLow = isLowStock(after);
  if (nowLow && !wasLow)
    notify(tx, {
      userIds: ownerAudience(tx, item),
      exclude: ctx.userId,
      kind: "stock.low",
      itemId: item.id,
      payload: { quantity: after.quantity, minQuantity: after.minQuantity, unit: item.unit },
      dedupe: true,
    });
  else if (wasLow && !nowLow) withdrawNotices(tx, item.id, "stock.low");
}

export type StockResult = { quantity: number; version: number; lowStock: boolean };

export function adjustStock(db: AppDb, ctx: AuthCtx, raw: AdjustStockInput): StockResult {
  const input = parseInput(adjustStockInput, raw);
  return db.transaction((tx) => {
    const { item } = requireItem(tx, ctx, input.id, "use");
    const before = { quantity: item.quantity, minQuantity: item.minQuantity };
    const next = round(input.quantity ?? item.quantity + (input.delta ?? 0));
    if (next < 0) throw new ItemsError(422, "STOCK_NEGATIVE");
    if (next === item.quantity)
      return { quantity: next, version: item.version, lowStock: isLowStock(before) };
    const after = { ...before, quantity: next };
    const version = writeVersioned(tx, item.id, item.version, { quantity: next });
    recordStockChange(tx, ctx, item, before, after, input.reason, input.note ?? null);
    recordItemEvent(tx, {
      actorId: ctx.userId,
      action: "item.stock_adjusted",
      itemId: item.id,
      diff: {
        quantity: { from: item.quantity, to: next },
        reason: input.reason,
        ...(input.note ? { note: input.note } : {}),
      },
    });
    return { quantity: next, version, lowStock: isLowStock(after) };
  });
}
