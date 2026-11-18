// Input schemas for the item, location, tag, search and history server
// functions. Shared: the server functions validate with them, the services
// parse again (they can be called from elsewhere), and forms may reuse them.
import { z } from "zod";
import { isValidIsoDate } from "../item-types/fields";
import {
  GRANT_LEVELS,
  ITEM_NAME_MAX,
  ITEM_SORTS,
  ITEM_STATUSES,
  LOCATION_KINDS,
  OWNER_KINDS,
  PRINCIPAL_KINDS,
  SEARCH_PAGE_MAX,
  STOCK_ADJUST_REASONS,
  TAG_NAME_MAX,
  VISIBILITIES,
} from "./constants";

export const idSchema = z.string().min(1).max(64);
const version = z.number().int().min(1);

/** Optional text: trimmed, "" becomes null. */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

const isoDate = z.string().refine(isValidIsoDate, "invalid date");

export const ownerInput = z.object({
  ownerKind: z.enum(OWNER_KINDS),
  /** users.id / groups.id; omit or null for the household. */
  ownerId: idSchema.nullable().optional(),
});
export type OwnerInputData = z.infer<typeof ownerInput>;

export const tagNameSchema = z.string().trim().min(1).max(TAG_NAME_MAX);
export const tagColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase())
  .nullable();

const itemFields = {
  name: z.string().trim().min(1).max(ITEM_NAME_MAX),
  description: optText(5000),
  quantity: z.number().finite().min(0).max(1e9),
  unit: optText(20),
  minQuantity: z.number().finite().min(0).max(1e9).nullable(),
  condition: optText(200),
  acquiredOn: isoDate.nullable(),
  /** Integer cents, >= 0. Set without currency: the household currency is used. */
  priceCents: z.number().int().min(0).max(1e12).nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  barcode: optText(64),
  /**
   * The complete set of active attribute values (stored shape, see
   * src/lib/item-types/fields.ts). Active keys left out are cleared; legacy
   * values are kept by the server.
   */
  attributes: z.record(z.string(), z.unknown()),
  /** Tag names; unknown names create the tag. Replaces the item's tag set. */
  tags: z.array(tagNameSchema).max(30),
};

export const createItemInput = z.object({
  typeId: idSchema,
  name: itemFields.name,
  description: itemFields.description,
  /** Default: the household. */
  owner: ownerInput.optional(),
  /** Default: household. A household-owned item cannot be private (HOUSEHOLD_PRIVATE). */
  visibility: z.enum(VISIBILITIES).optional(),
  locationId: idSchema.nullable().optional(),
  /** Inside a container item; its location then follows the container. */
  containerItemId: idSchema.nullable().optional(),
  quantity: itemFields.quantity.optional(),
  unit: itemFields.unit,
  minQuantity: itemFields.minQuantity.optional(),
  status: z.enum(ITEM_STATUSES).optional(),
  condition: itemFields.condition,
  acquiredOn: itemFields.acquiredOn.optional(),
  priceCents: itemFields.priceCents.optional(),
  currency: itemFields.currency.optional(),
  barcode: itemFields.barcode,
  attributes: itemFields.attributes.optional(),
  tags: itemFields.tags.optional(),
});
export type CreateItemInput = z.input<typeof createItemInput>;

/** A patch: only the fields present are changed. Needs `edit`. */
export const updateItemInput = z.object({
  id: idSchema,
  version,
  name: itemFields.name.optional(),
  description: itemFields.description,
  quantity: itemFields.quantity.optional(),
  unit: itemFields.unit,
  minQuantity: itemFields.minQuantity.optional(),
  condition: itemFields.condition,
  acquiredOn: itemFields.acquiredOn.optional(),
  priceCents: itemFields.priceCents.optional(),
  currency: itemFields.currency.optional(),
  barcode: itemFields.barcode,
  attributes: itemFields.attributes.optional(),
  tags: itemFields.tags.optional(),
});
export type UpdateItemInput = z.input<typeof updateItemInput>;

export const itemRefInput = z.object({ id: idSchema, version });
export type ItemRefInput = z.infer<typeof itemRefInput>;

/**
 * Needs `use`. `containerItemId` (non-null) puts the item into a container (its
 * location follows the container); otherwise `locationId` (null = no location)
 * places it and takes it out of any container.
 */
export const moveItemInput = z
  .object({
    id: idSchema,
    version,
    locationId: idSchema.nullable().optional(),
    containerItemId: idSchema.nullable().optional(),
  })
  .refine((v) => v.locationId !== undefined || v.containerItemId !== undefined, {
    message: "locationId or containerItemId required",
  });
export type MoveItemInput = z.infer<typeof moveItemInput>;

export const setItemStatusInput = z.object({
  id: idSchema,
  version,
  status: z.enum(ITEM_STATUSES),
});
export type SetItemStatusInput = z.infer<typeof setItemStatusInput>;

/**
 * Needs `edit`. Without `confirm` nothing is written and the preview comes
 * back; with `confirm: true` the plan is applied. `attributes` (optional) fills
 * values of the new type, e.g. its required fields (plan.missingRequired).
 */
export const changeItemTypeInput = z.object({
  id: idSchema,
  version,
  typeId: idSchema,
  confirm: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});
export type ChangeItemTypeInput = z.infer<typeof changeItemTypeInput>;

export const changeOwnerInput = z.object({ id: idSchema, version, owner: ownerInput });
export type ChangeOwnerInput = z.infer<typeof changeOwnerInput>;

export const setVisibilityInput = z.object({
  id: idSchema,
  version,
  visibility: z.enum(VISIBILITIES),
});
export type SetVisibilityInput = z.infer<typeof setVisibilityInput>;

export const principalInput = z.object({
  itemId: idSchema,
  principalKind: z.enum(PRINCIPAL_KINDS),
  principalId: idSchema,
});
export const setGrantInput = principalInput.extend({ level: z.enum(GRANT_LEVELS) });
export type SetGrantInput = z.infer<typeof setGrantInput>;
export type RemoveGrantInput = z.infer<typeof principalInput>;

/** Admin: every item owned by `fromUserId` goes to the household or another user. */
export const reassignItemsInput = z.object({
  fromUserId: idSchema,
  to: z.discriminatedUnion("ownerKind", [
    z.object({ ownerKind: z.literal("household") }),
    z.object({ ownerKind: z.literal("user"), ownerId: idSchema }),
  ]),
});
export type ReassignItemsInput = z.infer<typeof reassignItemsInput>;

/**
 * Needs `use`.
 * Either `delta` (e.g. -1 used, +10 restocked) or `quantity` (a count: the new total).
 * Stock changes add up, so no version is needed.
 */
export const adjustStockInput = z
  .object({
    id: idSchema,
    delta: z.number().finite().min(-1e9).max(1e9).optional(),
    quantity: itemFields.quantity.optional(),
    reason: z.enum(STOCK_ADJUST_REASONS),
    note: optText(200),
  })
  .refine((v) => (v.delta === undefined) !== (v.quantity === undefined), {
    message: "delta or quantity required",
  });
export type AdjustStockInput = z.input<typeof adjustStockInput>;

export const tagAttachInput = z.object({ itemId: idSchema, version, name: tagNameSchema });
export const tagDetachInput = z.object({ itemId: idSchema, version, tagId: idSchema });

// --- Locations ------------------------------------------------------------------
const locationName = z.string().trim().min(1).max(80);
export const createLocationInput = z.object({
  name: locationName,
  parentId: idSchema.nullable().optional(),
  kind: z.enum(LOCATION_KINDS).nullable().optional(),
  notes: optText(2000),
});
export type CreateLocationInput = z.input<typeof createLocationInput>;
export const updateLocationInput = z.object({
  id: idSchema,
  name: locationName.optional(),
  kind: z.enum(LOCATION_KINDS).nullable().optional(),
  notes: optText(2000),
});
export type UpdateLocationInput = z.input<typeof updateLocationInput>;
export const moveLocationInput = z.object({ id: idSchema, parentId: idSchema.nullable() });

// --- Tags (admin) ----------------------------------------------------------------
export const renameTagInput = z.object({ id: idSchema, name: tagNameSchema });
export const recolorTagInput = z.object({ id: idSchema, color: tagColorSchema });
export const mergeTagsInput = z.object({ sourceId: idSchema, targetId: idSchema });

// --- Search ----------------------------------------------------------------------
/**
 * One attribute filter (needs `typeId`). Interpreted by the field's kind:
 *  select, text, url, isbn, barcode, color, user, item: value IN `values`
 *    (multiple-valued fields and multiselect: contains any of `values`;
 *     text compares case-insensitively)
 *  boolean: `values: [true]` or `[false]`
 *  integer, decimal, measure (its value), date: `min` / `max` (inclusive) and/or `values`
 *  size: its value IN `values` (e.g. ["128"])
 */
export const attributeFilterInput = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  values: z
    .array(z.union([z.string().max(200), z.number().finite(), z.boolean()]))
    .max(50)
    .optional(),
  min: z.union([z.number().finite(), isoDate]).optional(),
  max: z.union([z.number().finite(), isoDate]).optional(),
});
export type AttributeFilter = z.infer<typeof attributeFilterInput>;

export const searchFiltersInput = z.object({
  /** Search text: FTS (>= 3 chars per word) over name, description, tags, attributes. */
  q: z.string().max(200).optional(),
  /** Type including its subtypes. */
  typeId: idSchema.optional(),
  /** Any of these owners. */
  owners: z.array(ownerInput).max(50).optional(),
  /** Owned by me directly or through one of my groups. */
  mine: z.boolean().optional(),
  locationId: idSchema.optional(),
  /** subtree (default): the location and all sub-locations, items in containers included.
   *  direct: items placed directly in the location, not inside a container. */
  locationScope: z.enum(["subtree", "direct"]).optional(),
  /** Items directly inside this container item. */
  containerId: idSchema.optional(),
  /** Items with neither a location nor a container ("not put away yet"); wins over locationId. */
  unplaced: z.boolean().optional(),
  /** Any of these statuses. Given explicitly, gone statuses are included. */
  statuses: z.array(z.enum(ITEM_STATUSES)).max(ITEM_STATUSES.length).optional(),
  /** Without `statuses`: also show gone items (archived, given away, sold, disposed). */
  includeGone: z.boolean().optional(),
  /** Items carrying ALL of these tags. */
  tagIds: z.array(idSchema).max(20).optional(),
  attributes: z.array(attributeFilterInput).max(20).optional(),
  /** Price range in cents (inclusive); only matches items whose price the caller may see. */
  priceMin: z.number().int().min(0).optional(),
  priceMax: z.number().int().min(0).optional(),
  /** Only items whose quantity is below their min_quantity. */
  lowStock: z.boolean().optional(),
  /** Only items whose warranty ends within the next WARRANTY_NOTICE_DAYS days, today included (src/lib/warranty.ts). */
  warrantyEnding: z.boolean().optional(),
});
export type SearchFilters = z.infer<typeof searchFiltersInput>;

export const searchItemsInput = searchFiltersInput.extend({
  sort: z.enum(ITEM_SORTS).optional(),
  /** `nextCursor` of the previous page (same filters and sort). */
  cursor: z.string().max(2000).optional(),
  limit: z.number().int().min(1).max(SEARCH_PAGE_MAX).optional(),
});
export type SearchItemsInput = z.infer<typeof searchItemsInput>;

export const pickItemsInput = z.object({
  q: z.string().max(200),
  /** Leave this item out (e.g. the item being edited). */
  excludeId: idSchema.optional(),
});

export const historyInput = z.object({
  itemId: idSchema,
  cursor: z.string().max(500).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
