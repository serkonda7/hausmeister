# TSX Review — Simplifications and Code Sharing

## 2. Medium: unify card / badge primitives

* `card card--compact card-row` + `<div><div class="title">…<div class="muted text-sm">…` + `<div class="card-actions"><Amount/><CrudRow/></div>` — identical in `Events:318-349`, `Allocations:209-243`, `Transactions:723-784`. Extract `<EntityCard title meta amount onEdit onDelete>`.
* `<span class="dot" style={{background: color ?? '#9ca3af'}}/>` in `Dashboard:129`, `Pools:351`, `Transactions:749,851`. Extract `<Dot color/>` with fallback inside.
* Liquidity / pool bars in `Dashboard.tsx:87-96,200-222`: extract `<Bar value color?>` + `<StatusBadge ok>`.
* `Dashboard:230-291` two `row-between` sections differ only in right-side formatting: extract `<Row title sub right>`.
* `Allocations:237` uses raw `<span class="strong--bold">{formatEUR(…)}</span>` — use `<Amount showSign={false}>` like everywhere else.
* `Amount.tsx:20-21`: `direction={totals().net >= 0 ? 'inflow':'outflow'}` in `Transactions:385` duplicates internal inference — drop the prop, let `Amount` infer.

## 3. Structural: `Transactions.tsx` (870 lines, biggest outlier)

Only CRUD page *not* using `useCrudForm`+`CrudForm` for its main form. It reimplements:

* `51-54 showForm/editingId/error` + `106-120 txnFormWrap/createEffect/handleFormKeyDown` — that's exactly what `CrudForm.tsx:22-35` already does (autofocus + `Esc`).
* `165-233 submitTxn/submitTransfer` duplicate validation (`!date || amount==null || NaN || <=0`) — share one `parsePositiveCents(str)` helper.
* `fromAccountId/toAccountId` selects, `payee/category/notes/date/amount` fields duplicated between txn and transfer subforms.

Split into `TransactionsList.tsx` + `TransactionForm.tsx` + `TransferForm.tsx` + `CategoriesSection.tsx` (~200 lines each), migrate main form to `useCrudForm`. Also `isTransferLeg`, `transferSameAccount`, delete-fallback button `767-776` → reuse `CrudRow` with `editLabel/deleteLabel` props (already supported).

Similarly `Currencies.tsx:246-302` download dialog reimplements `form-card + Esc + form-actions` — reuse `CrudForm` or extract generic `<Dialog>`. `shiftISO()` (`39-44`) + `spanDays` math (`93-98`) belong in `lib/format.ts` as `addDaysISO/diffDaysISO`.

## 4. Minor cleanups

* `App.tsx:158` `VIEWS.find(…)!.comp` + `biome-ignore`: use `const VIEW_MAP: Record<View, Component> = {...}` + `<Dynamic component={VIEW_MAP[view()]} />` — no non-null assertion.
* `Currencies.tsx:14-16 pairLegs()`: `PAIR_LEGS: Record<Pair,{from,to}>` constant instead of function.
* `lib/i18n.tsx:65 localeTag()` always `'de-DE'` — same constant as `format.ts:8 FIXED_TAG`. Keep one.
* `Dashboard.tsx:18 pct()`, `isOnTarget()` are pure — move to `lib/` for testability.

Suggested order: 1a–1f (mechanical, ~400 lines saved) → Dot/Bar/PageHeader → Transactions split.
