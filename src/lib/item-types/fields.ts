// Field definitions for item types (DESIGN §4.3) and the Zod schema builder for
// an item's `attributes` object. Shared by the dynamic form (client) and the
// server-side check, so both accept and reject exactly the same values.
//
// Stored value shape per kind (what lands in items.attributes[key]):
//   text        string (trimmed)                   multiple: string[]
//   longtext    string
//   integer     number (safe integer)
//   decimal     number (finite); `unit` lives on the definition, not the value
//   measure     { value: number, unit: string }    unit ∈ definition.units
//   boolean     boolean
//   date        "YYYY-MM-DD" (valid calendar date)
//   select      string ∈ options
//   multiselect string[] (unique, each ∈ options)
//   url         string (absolute http/https URL)   multiple: string[]
//   isbn        string, normalized: digits only (ISBN-10 may end in "X"), checksum valid
//   barcode     string (printable ASCII, no spaces) multiple: string[]
//   color       "#rrggbb" (lowercase hex)
//   size        { system: SizeSystem, value: string } value ∈ SIZE_VALUES[system]
//   user        users.id                           multiple: string[]
//   item        items.id                           multiple: string[]
// An empty value is stored as an absent key: "", null, [] and {value: ""} all
// normalize to "not set".
import { z } from "zod";
import { m } from "~/paraglide/messages";
import { formatDate, formatNumber } from "../format";

export const FIELD_KINDS = [
  "text",
  "longtext",
  "integer",
  "decimal",
  "measure",
  "boolean",
  "date",
  "select",
  "multiselect",
  "url",
  "isbn",
  "barcode",
  "color",
  "size",
  "user",
  "item",
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

/** Kinds that support `multiple: true` (a list of values). */
export const MULTIPLE_KINDS: readonly FieldKind[] = ["text", "url", "barcode", "user", "item"];
/** Kinds with `min`/`max` bounds (numbers, or 'YYYY-MM-DD' for date). */
export const RANGE_KINDS: readonly FieldKind[] = ["integer", "decimal", "measure", "date"];

export const SIZE_SYSTEMS = ["child", "clothing_num", "clothing_letter", "shoe_eu"] as const;
export type SizeSystem = (typeof SIZE_SYSTEMS)[number];

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Allowed values per size system (DESIGN §4.4). Shoe half sizes use a dot ("42.5"). */
export const SIZE_VALUES: Record<SizeSystem, readonly string[]> = {
  child: range(50, 176, 6).map(String),
  clothing_num: range(34, 58, 2).map(String),
  clothing_letter: ["XS", "S", "M", "L", "XL", "XXL"],
  shoe_eu: range(16, 50, 0.5).map(String),
};

export const ISBN_LOOKUPS = ["dnb", "openlibrary", "google"] as const;
export type IsbnLookup = (typeof ISBN_LOOKUPS)[number];

export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/;
export const MAX_FIELDS = 100;
export const TEXT_MAX = 500;
export const LONGTEXT_MAX = 20_000;
export const MULTIPLE_MAX = 50;

// --- Definition schema --------------------------------------------------------

export const fieldKeySchema = z
  .string()
  .regex(FIELD_KEY_PATTERN, { error: () => m.field_def_error_key() });

const labelSchema = z
  .string()
  .trim()
  .min(1, { error: () => m.field_def_error_label() })
  .max(80, { error: () => m.field_def_error_label() });

const shortText = (max: number) => z.string().trim().min(1).max(max);
const optionList = z
  .array(shortText(80), { error: () => m.field_def_error_options() })
  .min(1, { error: () => m.field_def_error_options() })
  .max(200)
  .refine((o) => new Set(o).size === o.length, { error: () => m.field_def_error_options_dup() });
const isoDate = z.string().refine(isValidIsoDate, { error: () => m.field_error_date() });

const base = {
  key: fieldKeySchema,
  label: labelSchema,
  required: z.boolean().optional(),
  /** Removed fields are hidden, never deleted (DESIGN §4.3 "Schema evolution"). */
  hidden: z.boolean().optional(),
  help: z.string().trim().max(200).optional(),
};
const multiple = { multiple: z.boolean().optional() };
const numRange = { min: z.number().finite().optional(), max: z.number().finite().optional() };
const unit = { unit: z.string().trim().min(1).max(20).optional() };

const minLeMax = (d: { min?: number | string; max?: number | string }) =>
  d.min === undefined || d.max === undefined || d.min <= d.max;
const minMaxCheck = { error: () => m.field_def_error_range(), path: ["max"] };

export const fieldDefinitionSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("text"),
    ...multiple,
    maxLength: z.number().int().min(1).max(TEXT_MAX).optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("longtext"),
    maxLength: z.number().int().min(1).max(LONGTEXT_MAX).optional(),
  }),
  z
    .object({
      ...base,
      kind: z.literal("integer"),
      min: z.number().int().optional(),
      max: z.number().int().optional(),
      ...unit,
    })
    .refine(minLeMax, minMaxCheck),
  z
    .object({ ...base, kind: z.literal("decimal"), ...numRange, ...unit })
    .refine(minLeMax, minMaxCheck),
  z
    .object({
      ...base,
      kind: z.literal("measure"),
      units: z
        .array(shortText(20), { error: () => m.field_def_error_units() })
        .min(1, { error: () => m.field_def_error_units() })
        .max(20)
        .refine((u) => new Set(u).size === u.length, {
          error: () => m.field_def_error_options_dup(),
        }),
      ...numRange,
    })
    .refine(minLeMax, minMaxCheck),
  z.object({ ...base, kind: z.literal("boolean") }),
  z
    .object({ ...base, kind: z.literal("date"), min: isoDate.optional(), max: isoDate.optional() })
    .refine(minLeMax, minMaxCheck),
  z.object({ ...base, kind: z.literal("select"), options: optionList }),
  z.object({ ...base, kind: z.literal("multiselect"), options: optionList }),
  z.object({ ...base, kind: z.literal("url"), ...multiple }),
  z.object({
    ...base,
    kind: z.literal("isbn"),
    /** Metadata lookup chain (DESIGN §5.2), used by the ISBN auto-fill in v1.1. */
    lookup: z.array(z.enum(ISBN_LOOKUPS)).max(ISBN_LOOKUPS.length).optional(),
  }),
  z.object({ ...base, kind: z.literal("barcode"), ...multiple }),
  z.object({ ...base, kind: z.literal("color") }),
  z.object({
    ...base,
    kind: z.literal("size"),
    systems: z
      .array(z.enum(SIZE_SYSTEMS), { error: () => m.field_def_error_systems() })
      .min(1, { error: () => m.field_def_error_systems() })
      .refine((s) => new Set(s).size === s.length),
  }),
  z.object({ ...base, kind: z.literal("user"), ...multiple }),
  z.object({ ...base, kind: z.literal("item"), ...multiple }),
]);

export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export type FieldOf<K extends FieldKind> = Extract<FieldDefinition, { kind: K }>;

/** A type's own field list: unique keys, at most MAX_FIELDS entries. */
export const fieldListSchema = z
  .array(fieldDefinitionSchema)
  .max(MAX_FIELDS)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.key))
        ctx.addIssue({
          code: "custom",
          path: [i, "key"],
          message: m.field_def_error_key_dup({ key: f.key }),
        });
      seen.add(f.key);
    });
  });

/** Parses stored JSON leniently: unknown junk is dropped instead of breaking the type. */
export function parseStoredFields(raw: unknown): FieldDefinition[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldDefinition[] = [];
  for (const f of raw) {
    const r = fieldDefinitionSchema.safeParse(f);
    if (r.success) out.push(r.data);
  }
  return out;
}

export const supportsMultiple = (
  f: FieldDefinition,
): f is FieldDefinition & { multiple?: boolean } => MULTIPLE_KINDS.includes(f.kind);
export const isMultiple = (f: FieldDefinition) =>
  f.kind === "multiselect" || (supportsMultiple(f) && f.multiple === true);
export const activeFields = <T extends FieldDefinition>(fields: readonly T[]): T[] =>
  fields.filter((f) => !f.hidden);

/** A blank definition for the editor when the kind changes or a field is added. */
export function blankField(kind: FieldKind, key: string, label: string): FieldDefinition {
  const b = { key, label };
  switch (kind) {
    case "measure":
      return { ...b, kind, units: ["cm"] };
    case "select":
    case "multiselect":
      return { ...b, kind, options: [m.field_option_default()] };
    case "size":
      return { ...b, kind, systems: ["clothing_letter"] };
    default:
      return { ...b, kind } as FieldDefinition;
  }
}

// --- Value checks ---------------------------------------------------------------

export function isValidIsoDate(s: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return false;
  const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Strips spaces and hyphens, uppercases a trailing x. Does not validate. */
export function normalizeIsbn(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/** ISBN-10 or ISBN-13 with a valid check digit (input may contain spaces/hyphens). */
export function isValidIsbn(input: string): boolean {
  const s = normalizeIsbn(input);
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (10 - i) * (s[i] === "X" ? 10 : Number(s[i]));
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }
  return false;
}

export function isValidHttpUrl(input: string): boolean {
  if (input.length > 2000) return false;
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// --- Attribute schema builder -----------------------------------------------------

export type BuildOptions = {
  /**
   * Shape-only check: ignore required, min/max and length limits. Used by
   * migrations to decide whether a stored value still fits a field's kind.
   */
  lenient?: boolean;
};

const ID_MAX = 64;
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

/** Maps "empty" inputs to undefined; trims strings; drops empty list entries. */
export function normalizeEmpty(field: FieldDefinition, value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const t = field.kind === "longtext" ? value.replace(/\s+$/, "") : value.trim();
    return t.trim() === "" ? undefined : t;
  }
  if (Array.isArray(value)) {
    const items = value.map(trimmed).filter((v) => v !== undefined && v !== null && v !== "");
    return items.length === 0 ? undefined : items;
  }
  if (typeof value === "object" && (field.kind === "measure" || field.kind === "size")) {
    const v = (value as { value?: unknown }).value;
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === ""))
      return undefined;
  }
  return value;
}

function numberSchema(field: { min?: number; max?: number }, int: boolean, lenient: boolean) {
  let s = z.number({ error: () => m.field_error_number() }).refine(Number.isFinite, {
    error: () => m.field_error_number(),
  });
  if (int) s = s.refine(Number.isSafeInteger, { error: () => m.field_error_integer() });
  if (!lenient && field.min !== undefined) {
    const min = field.min;
    s = s.refine((n) => n >= min, {
      error: () => m.field_error_min({ min: formatNumber(min, 6) }),
    });
  }
  if (!lenient && field.max !== undefined) {
    const max = field.max;
    s = s.refine((n) => n <= max, {
      error: () => m.field_error_max({ max: formatNumber(max, 6) }),
    });
  }
  return s;
}

function stringSchema(max: number, lenient: boolean) {
  const s = z.string({ error: () => m.field_error_invalid() });
  return lenient ? s : s.max(max, { error: () => m.field_error_too_long({ max: String(max) }) });
}

const idSchema = z
  .string({ error: () => m.field_error_invalid() })
  .min(1)
  .max(ID_MAX, { error: () => m.field_error_invalid() });

function listOf<T extends z.ZodType>(item: T) {
  return z
    .array(item, { error: () => m.field_error_invalid() })
    .max(MULTIPLE_MAX, { error: () => m.field_error_too_many({ max: String(MULTIPLE_MAX) }) })
    .refine((a) => new Set(a.map((v) => JSON.stringify(v))).size === a.length, {
      error: () => m.field_error_duplicate(),
    });
}

/** Schema for a single, non-empty value of `field` (see the shape table on top). */
export function fieldValueSchema(field: FieldDefinition, opts: BuildOptions = {}): z.ZodType {
  const lenient = opts.lenient === true;
  const multi = (s: z.ZodType) => (isMultiple(field) ? listOf(s) : s);
  switch (field.kind) {
    case "text":
      return multi(stringSchema(field.maxLength ?? TEXT_MAX, lenient));
    case "longtext":
      return stringSchema(field.maxLength ?? LONGTEXT_MAX, lenient);
    case "integer":
      return numberSchema(field, true, lenient);
    case "decimal":
      return numberSchema(field, false, lenient);
    case "measure": {
      const units = field.units as [string, ...string[]];
      return z.object(
        {
          value: numberSchema(field, false, lenient),
          unit: z.enum(units, { error: () => m.field_error_unit() }),
        },
        { error: () => m.field_error_invalid() },
      );
    }
    case "boolean":
      return z.boolean({ error: () => m.field_error_invalid() });
    case "date": {
      let s = z
        .string({ error: () => m.field_error_date() })
        .refine(isValidIsoDate, { error: () => m.field_error_date() });
      if (!lenient && field.min) {
        const min = field.min;
        s = s.refine((d) => d >= min, {
          error: () => m.field_error_date_min({ min: formatDate(`${min}T12:00:00Z`) }),
        });
      }
      if (!lenient && field.max) {
        const max = field.max;
        s = s.refine((d) => d <= max, {
          error: () => m.field_error_date_max({ max: formatDate(`${max}T12:00:00Z`) }),
        });
      }
      return s;
    }
    case "select":
      return z.enum(field.options as [string, ...string[]], {
        error: () => m.field_error_option(),
      });
    case "multiselect":
      return listOf(
        z.enum(field.options as [string, ...string[]], { error: () => m.field_error_option() }),
      );
    case "url":
      return multi(
        z
          .string({ error: () => m.field_error_url() })
          .refine(isValidHttpUrl, { error: () => m.field_error_url() }),
      );
    case "isbn":
      return z
        .string({ error: () => m.field_error_isbn() })
        .refine(isValidIsbn, { error: () => m.field_error_isbn() })
        .transform(normalizeIsbn);
    case "barcode":
      return multi(
        z
          .string({ error: () => m.field_error_barcode() })
          .regex(/^[\x21-\x7E]{1,128}$/, { error: () => m.field_error_barcode() }),
      );
    case "color":
      return z
        .string({ error: () => m.field_error_color() })
        .regex(/^#[0-9a-fA-F]{6}$/, { error: () => m.field_error_color() })
        .transform((c) => c.toLowerCase());
    case "size": {
      const systems = field.systems as [SizeSystem, ...SizeSystem[]];
      return z
        .object(
          {
            system: z.enum(systems, { error: () => m.field_error_size_system() }),
            value: z.string({ error: () => m.field_error_size() }),
          },
          { error: () => m.field_error_size() },
        )
        .refine((v) => SIZE_VALUES[v.system]?.includes(v.value), {
          error: () => m.field_error_size(),
          path: ["value"],
        });
    }
    case "user":
    case "item":
      return multi(idSchema);
  }
}

/**
 * Schema for one attribute: handles empty values, `required` and the value
 * shape. Output is the canonical stored value, or undefined when empty.
 * Boolean fields are never "required" (an unchecked box is a valid answer).
 */
export function fieldSchema(field: FieldDefinition, opts: BuildOptions = {}): z.ZodType<unknown> {
  const inner = fieldValueSchema(field, opts);
  return z.unknown().transform((raw, ctx) => {
    const value = normalizeEmpty(field, raw);
    if (value === undefined) {
      if (field.required && !opts.lenient && field.kind !== "boolean") {
        ctx.addIssue({ code: "custom", message: m.field_error_required() });
        return z.NEVER;
      }
      return undefined;
    }
    const r = inner.safeParse(value);
    if (!r.success) {
      for (const issue of r.error.issues)
        ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
      return z.NEVER;
    }
    return r.data;
  });
}

/**
 * Zod schema for an item's `attributes`, built from its (effective) field list.
 * Active fields are validated; hidden fields and unknown keys pass through
 * untouched (legacy values). Empty values are removed from the output.
 * For saving use `prepareAttributes`, which also decides what happens to legacy keys.
 */
export function buildAttributesSchema(fields: readonly FieldDefinition[], opts: BuildOptions = {}) {
  const active = activeFields(fields).map((f) => [f, fieldSchema(f, opts)] as const);
  return z
    .record(z.string(), z.unknown(), { error: () => m.field_error_invalid() })
    .transform((input, ctx) => {
      const out: Record<string, unknown> = { ...input };
      for (const [f, schema] of active) {
        const r = schema.safeParse(input[f.key]);
        if (!r.success) {
          for (const issue of r.error.issues)
            ctx.addIssue({ code: "custom", message: issue.message, path: [f.key, ...issue.path] });
        } else if (r.data === undefined) delete out[f.key];
        else out[f.key] = r.data;
      }
      for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
      return out;
    });
}

export type AttributeErrors = Record<string, string>;
export type PrepareResult =
  | { ok: true; attributes: Record<string, unknown> }
  | { ok: false; errors: AttributeErrors };

/**
 * The server-side save rule. Active fields come from `input` and must validate.
 * Legacy keys (hidden fields, keys from an earlier type) are never taken from
 * the client: they are copied from `previous`, except that `null` in `input`
 * for a legacy key removes it ("clean up legacy fields"). Unknown new keys are dropped.
 */
export function prepareAttributes(
  fields: readonly FieldDefinition[],
  input: Record<string, unknown>,
  previous: Record<string, unknown> = {},
): PrepareResult {
  const active = activeFields(fields);
  const activeKeys = new Set(active.map((f) => f.key));
  const picked: Record<string, unknown> = {};
  for (const k of activeKeys) if (k in input) picked[k] = input[k];
  const r = buildAttributesSchema(active).safeParse(picked);
  if (!r.success) return { ok: false, errors: issuesToErrors(r.error.issues) };
  const out: Record<string, unknown> = { ...r.data };
  for (const [k, v] of Object.entries(previous)) {
    if (activeKeys.has(k) || v === undefined) continue;
    if (k in input && input[k] === null) continue;
    out[k] = v;
  }
  return { ok: true, attributes: out };
}

/** First message per top-level attribute key. */
export function issuesToErrors(issues: readonly z.core.$ZodIssue[]): AttributeErrors {
  const errors: AttributeErrors = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "");
    errors[key] ??= i.message;
  }
  return errors;
}

/** Validates one value against a field, returning a German message or undefined. */
export function validateFieldValue(field: FieldDefinition, value: unknown): string | undefined {
  const r = fieldSchema(field).safeParse(value);
  return r.success ? undefined : r.error.issues[0]?.message;
}

/** User and item ids referenced by active `user`/`item` fields. */
export function collectReferences(
  fields: readonly FieldDefinition[],
  attributes: Record<string, unknown>,
): { userIds: string[]; itemIds: string[] } {
  const userIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const f of activeFields(fields)) {
    if (f.kind !== "user" && f.kind !== "item") continue;
    const v = attributes[f.key];
    const list = Array.isArray(v) ? v : v === undefined ? [] : [v];
    for (const id of list)
      if (typeof id === "string") (f.kind === "user" ? userIds : itemIds).add(id);
  }
  return { userIds: [...userIds], itemIds: [...itemIds] };
}
