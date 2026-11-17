// Turns a history entry's diff into German lines for the item page:
//   { label: "Ort", from: "Garage", to: "Keller" }
// plus a one-line summary for grant and attachment events. Pure.
import { formatCents, formatDate } from "~/lib/format";
import { formatAttributeValue, formatUnknown } from "~/lib/item-types/display";
import type { FieldDefinition } from "~/lib/item-types/fields";
import { m } from "~/paraglide/messages";
import { ITEM_STATUSES, type ItemStatus } from "./constants";
import { BASE_LABEL, type ItemBaseValues } from "./form";
import { levelLabel, statusLabel } from "./labels";
import type { HistoryEntry, HistoryPage, JsonValue } from "./types";

export type HistoryLine = { key: string; label: string; from: string; to: string };
/**
 * `collapsed`: creation entries carry every initial value; the UI shows only
 * the summary (the name) and keeps the lines behind "Anfangswerte" (the event
 * itself still stores everything).
 */
export type FormattedEntry = {
  summary: string | null;
  lines: HistoryLine[];
  collapsed: boolean;
  /** Label of the collapsed lines (default "Anfangswerte (n)"). */
  detailsLabel?: string;
};

export type HistoryContext = {
  names: HistoryPage["names"];
  fields: readonly FieldDefinition[];
  typeName?: (id: string) => string | undefined;
};

const NONE = "—";
const ATTR = "attributes.";
/** Context keys that are not changes themselves. */
const SKIP = new Set([
  "reason",
  "removed",
  "converted",
  "principalKind",
  "principalId",
  "attachmentId",
  "kind",
  "originalName",
]);

type Change = { from: JsonValue | undefined; to: JsonValue | undefined };
const isChange = (v: unknown): v is Change =>
  !!v && typeof v === "object" && !Array.isArray(v) && ("from" in v || "to" in v);

const empty = (v: unknown) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function ownerName(
  ctx: HistoryContext,
  kind: JsonValue | undefined,
  id: JsonValue | undefined,
): string {
  if (kind === "household" || (kind === undefined && empty(id))) return m.items_owner_household();
  if (typeof id !== "string") return NONE;
  return (
    (kind === "group" ? ctx.names.groups[id] : ctx.names.users[id]) ??
    ctx.names.users[id] ??
    ctx.names.groups[id] ??
    m.items_owner_unknown()
  );
}

function labelFor(key: string, ctx: HistoryContext): string {
  if (key.startsWith(ATTR)) {
    const k = key.slice(ATTR.length);
    return ctx.fields.find((f) => f.key === k)?.label ?? k;
  }
  if (key in BASE_LABEL) return BASE_LABEL[key as keyof ItemBaseValues]();
  switch (key) {
    case "priceCents":
      return m.item_field_price();
    case "currency":
      return m.item_history_currency();
    case "typeId":
      return m.item_field_type();
    case "owner":
      return m.item_field_owner();
    case "visibility":
      return m.item_field_visibility();
    case "locationId":
      return m.item_field_location();
    case "containerItemId":
      return m.item_field_container();
    case "status":
      return m.item_field_status();
    case "shortCode":
      return m.item_short_code();
    case "level":
      return m.item_share_level();
    default:
      return key;
  }
}

export function formatHistoryValue(key: string, v: JsonValue | undefined, ctx: HistoryContext) {
  if (empty(v)) return NONE;
  if (key.startsWith(ATTR)) {
    const field = ctx.fields.find((f) => f.key === key.slice(ATTR.length));
    const text = field
      ? formatAttributeValue(field, v, {
          userName: (id) => ctx.names.users[id],
          itemName: (id) => ctx.names.items[id],
        })
      : formatUnknown(v);
    return text || NONE;
  }
  switch (key) {
    case "status":
      return (ITEM_STATUSES as readonly string[]).includes(String(v))
        ? statusLabel(v as ItemStatus)
        : String(v);
    case "visibility":
      return v === "private"
        ? m.item_visibility_private_short()
        : m.item_visibility_household_short();
    case "priceCents":
      return typeof v === "number" ? formatCents(v) : formatUnknown(v);
    case "acquiredOn":
      return typeof v === "string" ? formatDate(`${v}T12:00:00Z`) : formatUnknown(v);
    case "locationId":
      return typeof v === "string"
        ? (ctx.names.locations[v] ?? m.item_history_hidden_location())
        : NONE;
    case "containerItemId":
      return typeof v === "string" ? (ctx.names.items[v] ?? m.items_hidden_container()) : NONE;
    case "typeId":
      return typeof v === "string" ? (ctx.typeName?.(v) ?? m.item_history_unknown_type()) : NONE;
    case "level":
      return ["view", "use", "edit", "manage"].includes(String(v))
        ? levelLabel(v as "view" | "use" | "edit" | "manage")
        : String(v);
    default:
      return formatUnknown(v) || NONE;
  }
}

/** Flattens `attributes: { k: {from,to} }` (type migrations) into `attributes.k`. */
function changes(diff: Record<string, JsonValue>): [string, Change][] {
  const out: [string, Change][] = [];
  for (const [k, v] of Object.entries(diff)) {
    if (SKIP.has(k)) continue;
    if (k === "attributes" && v && typeof v === "object" && !Array.isArray(v) && !isChange(v)) {
      for (const [ak, av] of Object.entries(v)) if (isChange(av)) out.push([`${ATTR}${ak}`, av]);
      continue;
    }
    if (isChange(v)) out.push([k, v]);
  }
  return out;
}

export function formatHistoryEntry(e: HistoryEntry, ctx: HistoryContext): FormattedEntry {
  const d = e.diff as Record<string, JsonValue>;
  let summary: string | null = null;
  if (e.action === "item.grant_set" || e.action === "item.grant_removed") {
    const id = typeof d.principalId === "string" ? d.principalId : "";
    const name =
      (d.principalKind === "group" ? ctx.names.groups[id] : ctx.names.users[id]) ??
      m.items_owner_unknown();
    summary = m.item_history_grant({ name });
  } else if (e.action === "attachment.added" || e.action === "attachment.removed") {
    summary = typeof d.originalName === "string" && d.originalName ? d.originalName : null;
  } else if (d.reason === "location_deleted") summary = m.item_history_reason_location_deleted();
  else if (d.reason === "container_deleted") summary = m.item_history_reason_container_deleted();

  const list = changes(d);
  const owner = list.filter(([k]) => k === "ownerKind" || k === "ownerId");
  const lines: HistoryLine[] = [];
  if (owner.length) {
    const kind = Object.fromEntries(owner).ownerKind as Change | undefined;
    const oid = Object.fromEntries(owner).ownerId as Change | undefined;
    lines.push({
      key: "owner",
      label: labelFor("owner", ctx),
      from: ownerName(ctx, kind?.from, oid?.from),
      to: ownerName(ctx, kind?.to, oid?.to),
    });
  }
  for (const [k, c] of list) {
    if (k === "ownerKind" || k === "ownerId") continue;
    lines.push({
      key: k,
      label: labelFor(k, ctx),
      from: formatHistoryValue(k, c.from, ctx),
      to: formatHistoryValue(k, c.to, ctx),
    });
  }
  if (e.action === "item.created") {
    const name = lines.find((l) => l.key === "name");
    return {
      summary: name?.to || summary,
      lines: lines.filter((l) => l.key !== "name"),
      collapsed: true,
    };
  }
  return { summary, lines, collapsed: false };
}

const FILE_ACTIONS = new Set(["attachment.added", "attachment.removed"]);

/**
 * Uploading twenty photos at once writes twenty `attachment.added` events.
 * Consecutive file events of the same kind by the same person within
 * `windowMs` become one entry ("20 Dateien"), with the file names collapsed.
 * Input and output are newest first.
 */
export function groupFileRuns<T extends { e: HistoryEntry; f: FormattedEntry }>(
  list: readonly T[],
  windowMs = 10 * 60_000,
): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < list.length) {
    const first = list[i]!;
    let j = i + 1;
    if (FILE_ACTIONS.has(first.e.action)) {
      const at = (x: T) => new Date(x.e.at).getTime();
      while (
        j < list.length &&
        list[j]!.e.action === first.e.action &&
        (list[j]!.e.actor?.id ?? null) === (first.e.actor?.id ?? null) &&
        at(first) - at(list[j]!) <= windowMs
      )
        j++;
    }
    const run = list.slice(i, j);
    if (run.length < 2) out.push(first);
    else
      out.push({
        ...first,
        f: {
          summary: m.item_history_files({ count: run.length }),
          lines: run.map((x) => ({
            key: x.e.id,
            label: m.item_history_file(),
            from: "",
            to: x.f.summary ?? "",
          })),
          collapsed: true,
          detailsLabel: m.item_history_file_names(),
        },
      });
    i = j;
  }
  return out;
}
