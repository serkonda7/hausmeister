// Item references in `item`-kind attribute fields that point at items the
// caller cannot see. Their ids never leave the server (the name was always
// withheld; the id alone confirms the item exists and lets it be correlated).
//
// Round trip: responses carry the attributes without hidden ids plus
// `hiddenReferences` (field key -> how many were left out). On save the client
// sends what it saw; restoreHiddenReferences puts the hidden ids back first, so
// an editor can neither see nor accidentally drop them:
//  - multiple fields: hidden ids are appended to whatever the client sends;
//  - single fields: an empty value keeps the hidden reference; choosing another
//    item replaces it (the form says so next to the field).
// Legacy values of fields the type no longer has (e.g. after a type change)
// have no known kind; a string there that is the id of an existing item the
// caller cannot see is treated the same way. Legacy values are kept on save by
// prepareItemAttributes anyway.
import { inArray } from "drizzle-orm";
import { type FieldDefinition, isMultiple } from "../../lib/item-types/fields";
import type { AuthCtx } from "../authz/ctx";
import type { DbOrTx } from "../db/client";
import { items } from "../db/schema";
import { visibleItemIds } from "./placement";

const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ids ctx cannot see: in `item` fields (hidden fields included; missing items
 * count as hidden, so a stripped id never tells "exists" from "deleted"), and
 * in legacy values (only ids of existing items).
 */
export function hiddenReferenceIds(
  db: DbOrTx,
  ctx: AuthCtx,
  fields: readonly FieldDefinition[],
  attributes: Record<string, unknown>,
): Set<string> {
  const known = new Set(fields.map((f) => f.key));
  const refs: string[] = [];
  const legacy: string[] = [];
  for (const f of fields)
    if (f.kind === "item")
      for (const x of listOf(attributes[f.key])) if (typeof x === "string") refs.push(x);
  for (const [k, v] of Object.entries(attributes))
    if (!known.has(k))
      for (const x of listOf(v)) if (typeof x === "string" && UUID.test(x)) legacy.push(x);
  if (refs.length === 0 && legacy.length === 0) return new Set();
  const visible = visibleItemIds(db, ctx, [...refs, ...legacy]);
  const hidden = new Set(refs.filter((id) => !visible.has(id)));
  const candidates = [...new Set(legacy.filter((id) => !visible.has(id)))];
  for (let i = 0; i < candidates.length; i += 400)
    for (const r of db
      .select({ id: items.id })
      .from(items)
      .where(inArray(items.id, candidates.slice(i, i + 400)))
      .all())
      hidden.add(r.id);
  return hidden;
}

/** The attributes without hidden ids, and per field how many were removed. */
export function stripHiddenReferences(
  fields: readonly FieldDefinition[],
  attributes: Record<string, unknown>,
  hidden: ReadonlySet<string>,
): { attributes: Record<string, unknown>; hiddenReferences: Record<string, number> } {
  const out = { ...attributes };
  const counts: Record<string, number> = {};
  if (hidden.size === 0) return { attributes: out, hiddenReferences: counts };
  const kind = new Map(fields.map((f) => [f.key, f.kind]));
  for (const key of Object.keys(out)) {
    const k = kind.get(key);
    if (k !== undefined && k !== "item") continue;
    const v = out[key];
    const kept = listOf(v).filter((x) => !(typeof x === "string" && hidden.has(x)));
    const removed = listOf(v).length - kept.length;
    if (!removed) continue;
    counts[key] = removed;
    if (Array.isArray(v)) out[key] = kept;
    else delete out[key];
  }
  return { attributes: out, hiddenReferences: counts };
}

/** The client's attributes with the hidden ids of `previous` put back (see top of file). */
export function restoreHiddenReferences(
  fields: readonly FieldDefinition[],
  input: Record<string, unknown>,
  previous: Record<string, unknown>,
  hidden: ReadonlySet<string>,
): Record<string, unknown> {
  if (hidden.size === 0) return input;
  const out = { ...input };
  for (const f of fields) {
    if (f.kind !== "item" || f.hidden) continue;
    const prev = listOf(previous[f.key]).filter(
      (x): x is string => typeof x === "string" && hidden.has(x),
    );
    if (prev.length === 0) continue;
    const v = out[f.key];
    if (isMultiple(f)) {
      const list = listOf(v);
      out[f.key] = [...list, ...prev.filter((id) => !list.includes(id))];
    } else if (v === undefined || v === null || v === "") {
      out[f.key] = prev[0];
    }
  }
  return out;
}
