export type FieldDiff = Record<string, { from: unknown; to: unknown }>;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined;
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Structural equality: arrays (order-sensitive), plain objects and Dates by time. */
function deepEqual(left: unknown, right: unknown): boolean {
  const a = isEmpty(left) ? null : left;
  const b = isEmpty(right) ? null : right;
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && Object.is(a.getTime(), b.getTime());
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(bRecord, key)) return false;
    if (!deepEqual(aRecord[key], bRecord[key])) return false;
  }
  return true;
}

/** Diffs top-level fields; null, undefined and missing keys are the same "empty" value. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): FieldDiff {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const result: FieldDiff = {};
  for (const key of keys) {
    const from = isEmpty(before[key]) ? null : before[key];
    const to = isEmpty(after[key]) ? null : after[key];
    if (!deepEqual(from, to)) {
      result[key] = { from, to };
    }
  }
  return result;
}
