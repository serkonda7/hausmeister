// Single source of truth for shared picklists.
// Previously mirrored by copy in `backend/src/db/schema.ts` and
// `frontend/src/lib/enums.ts` — import from here instead.

export const liquidityTierEnum = ['instant', 'days', 'weeks', 'months', 'locked'] as const
export type LiquidityTier = (typeof liquidityTierEnum)[number]

export const accountTypeEnum = ['checking', 'savings', 'broker', 'crypto', 'other'] as const
export type AccountType = (typeof accountTypeEnum)[number]

export const directionEnum = ['inflow', 'outflow'] as const
export type Direction = (typeof directionEnum)[number]

export const frequencyEnum = ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const
export type Frequency = (typeof frequencyEnum)[number]

export const categoryKindEnum = ['income', 'expense'] as const
export type CategoryKind = (typeof categoryKindEnum)[number]

// Currencies (Firefly III inspired). Only EUR + USD are supported for now;
// the enum is the single gate: backend validators and frontend selectors
// import from here so adding a code later is a one-line change.
export const currencyCodeEnum = ['EUR', 'USD'] as const
export type CurrencyCode = (typeof currencyCodeEnum)[number]

// ---- Inventory + asset management (separate domain from finance) ----
// Lifecycle of a single tracked asset. Stock quantities live on inventory
// items; this enum only describes individually tracked assets.
export const assetStatusEnum = ['in_use', 'stored', 'lent', 'maintenance', 'retired'] as const
export type AssetStatus = (typeof assetStatusEnum)[number]
