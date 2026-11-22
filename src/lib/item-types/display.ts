// Turning stored attribute values into text: for display, and flattened for the
// search index (items_fts.attrs). German labels come from the message catalog.

import { m } from "~/paraglide/messages";
import { formatDate, formatNumber } from "../format";
import { normalizeSearchText } from "../normalize";
import {
  activeFields,
  type FieldDefinition,
  type FieldKind,
  SIZE_SYSTEMS,
  type SizeSystem,
} from "./fields";

export const fieldKindLabel = (kind: FieldKind): string =>
  ({
    text: m.field_kind_text,
    longtext: m.field_kind_longtext,
    integer: m.field_kind_integer,
    decimal: m.field_kind_decimal,
    measure: m.field_kind_measure,
    boolean: m.field_kind_boolean,
    date: m.field_kind_date,
    select: m.field_kind_select,
    multiselect: m.field_kind_multiselect,
    url: m.field_kind_url,
    isbn: m.field_kind_isbn,
    barcode: m.field_kind_barcode,
    color: m.field_kind_color,
    size: m.field_kind_size,
    user: m.field_kind_user,
    item: m.field_kind_item,
  })[kind]();

export const sizeSystemLabel = (s: SizeSystem): string =>
  ({
    child: m.field_size_child,
    clothing_num: m.field_size_clothing_num,
    clothing_letter: m.field_size_clothing_letter,
    shoe_eu: m.field_size_shoe_eu,
  })[s]();

/** "42.5" -> "42,5" for display; letters stay as they are. */
export const formatSizeValue = (v: string) => v.replace(".", ",");

export type ValueResolvers = {
  /** users.id -> display name */
  userName?: (id: string) => string | undefined;
  /** items.id -> item name */
  itemName?: (id: string) => string | undefined;
};

const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);

/** Display text for one value of `field`; "" for empty. */
export function formatAttributeValue(
  field: FieldDefinition,
  value: unknown,
  resolvers: ValueResolvers = {},
): string {
  if (value === undefined || value === null || value === "") return "";
  const join = (parts: unknown[], fn: (p: unknown) => string) =>
    parts.map(fn).filter(Boolean).join(", ");
  switch (field.kind) {
    case "integer":
    case "decimal":
      return typeof value === "number"
        ? `${formatNumber(value, 6)}${field.unit ? ` ${field.unit}` : ""}`
        : formatUnknown(value);
    case "measure": {
      const v = value as { value?: unknown; unit?: unknown };
      return typeof v?.value === "number"
        ? `${formatNumber(v.value, 6)} ${String(v.unit ?? "")}`.trim()
        : formatUnknown(value);
    }
    case "boolean":
      return value === true ? m.field_yes() : value === false ? m.field_no() : formatUnknown(value);
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? formatDate(`${value}T12:00:00Z`)
        : formatUnknown(value);
    case "size": {
      const v = value as { system?: SizeSystem; value?: unknown };
      if (typeof v?.value !== "string") return formatUnknown(value);
      return v.system && SIZE_SYSTEMS.includes(v.system)
        ? `${formatSizeValue(v.value)} (${sizeSystemLabel(v.system)})`
        : formatSizeValue(v.value);
    }
    case "user":
      return join(asList(value), (id) =>
        typeof id === "string" ? (resolvers.userName?.(id) ?? m.field_unknown_user()) : "",
      );
    case "item":
      return join(asList(value), (id) =>
        typeof id === "string" ? (resolvers.itemName?.(id) ?? m.field_unknown_item()) : "",
      );
    default:
      return join(asList(value), (p) => formatUnknown(p));
  }
}

/** Best-effort text for values whose field is unknown (legacy keys) or mistyped. */
export function formatUnknown(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return formatNumber(value, 6);
  if (typeof value === "boolean") return value ? m.field_yes() : m.field_no();
  if (Array.isArray(value)) return value.map(formatUnknown).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if ("value" in o)
      return [formatUnknown(o.value), formatUnknown(o.unit)].filter(Boolean).join(" ");
    return JSON.stringify(value);
  }
  return String(value);
}

export type DisplayEntry = { key: string; label: string; field?: FieldDefinition; value: unknown };

/**
 * Splits stored attributes into the active fields (in definition order, only
 * those with a value) and legacy values: hidden fields and keys the type
 * doesn't define, shown under "Alte Felder".
 */
export function splitAttributes(
  fields: readonly FieldDefinition[],
  attributes: Record<string, unknown>,
): { active: DisplayEntry[]; legacy: DisplayEntry[] } {
  const attrs = attributes ?? {};
  const has = (k: string) => attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== "";
  const active = activeFields(fields)
    .filter((f) => has(f.key))
    .map((f) => ({ key: f.key, label: f.label, field: f, value: attrs[f.key] }));
  const activeKeys = new Set(activeFields(fields).map((f) => f.key));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const legacy = Object.keys(attrs)
    .filter((k) => !activeKeys.has(k) && has(k))
    .map((k) => {
      const f = byKey.get(k);
      return { key: k, label: f?.label ?? k, field: f, value: attrs[k] };
    });
  return { active, legacy };
}

/**
 * One normalized string for items_fts.attrs: every non-empty value (legacy
 * ones included), formatted as displayed, plus labels of true booleans.
 * Pass resolvers to index user and item names; unresolved ids are skipped.
 */
export function flattenAttributesForSearch(
  fields: readonly FieldDefinition[],
  attributes: Record<string, unknown>,
  resolvers: ValueResolvers = {},
): string {
  const { active, legacy } = splitAttributes(fields, attributes);
  const parts: string[] = [];
  for (const e of [...active, ...legacy]) {
    const f = e.field;
    if (f?.kind === "boolean") {
      if (e.value === true) parts.push(f.label);
      continue;
    }
    if (f?.kind === "user" || f?.kind === "item") {
      const resolve = f.kind === "user" ? resolvers.userName : resolvers.itemName;
      for (const id of asList(e.value))
        if (typeof id === "string") {
          const n = resolve?.(id);
          if (n) parts.push(n);
        }
      continue;
    }
    if (f?.kind === "date" && typeof e.value === "string") parts.push(e.value);
    if (f?.kind === "size") {
      const v = e.value as { value?: unknown };
      if (typeof v?.value === "string") parts.push(formatSizeValue(v.value));
      continue;
    }
    parts.push(f ? formatAttributeValue(f, e.value, resolvers) : formatUnknown(e.value));
  }
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}
