import { describe, expect, test } from "bun:test";
import {
  buildAttributesSchema,
  type FieldDefinition,
  fieldDefinitionSchema,
  fieldListSchema,
  fieldSchema,
  isValidIsbn,
  normalizeIsbn,
  parseStoredFields,
  prepareAttributes,
  validateFieldValue,
} from "./fields";

const ok = (f: FieldDefinition, v: unknown) => fieldSchema(f).safeParse(v);
const accepts = (f: FieldDefinition, v: unknown, ...expected: unknown[]) => {
  const out = expected.length ? expected[0] : v;
  const r = ok(f, v);
  expect(r.success).toBe(true);
  if (r.success) expect(r.data).toEqual(out);
};
const rejects = (f: FieldDefinition, v: unknown) => expect(ok(f, v).success).toBe(false);

describe("field kinds", () => {
  test("text: trims, required, multiple, maxLength", () => {
    const f: FieldDefinition = { key: "t", label: "T", kind: "text", maxLength: 5 };
    accepts(f, "  abc ", "abc");
    accepts(f, "", undefined);
    accepts(f, undefined, undefined);
    rejects(f, "abcdef");
    rejects(f, 12);
    rejects({ ...f, required: true }, "  ");
    const multi: FieldDefinition = {
      key: "a",
      label: "A",
      kind: "text",
      multiple: true,
      required: true,
    };
    accepts(multi, ["Ende", " Kästner ", ""], ["Ende", "Kästner"]);
    rejects(multi, []);
    rejects(multi, "Ende");
    rejects(multi, ["x", "x"]);
  });

  test("longtext", () => {
    const f: FieldDefinition = { key: "l", label: "L", kind: "longtext" };
    accepts(f, "Zeile 1\nZeile 2\n", "Zeile 1\nZeile 2");
    rejects(f, "x".repeat(20_001));
  });

  test("integer: whole numbers within min/max", () => {
    const f: FieldDefinition = { key: "y", label: "Jahr", kind: "integer", min: 1450, max: 2100 };
    accepts(f, 1999);
    rejects(f, 1449);
    rejects(f, 2101);
    rejects(f, 1999.5);
    rejects(f, "1999");
    rejects(f, Number.NaN);
    rejects({ ...f, required: true }, undefined);
  });

  test("decimal", () => {
    const f: FieldDefinition = { key: "w", label: "Gewicht", kind: "decimal", min: 0, unit: "kg" };
    accepts(f, 1.25);
    rejects(f, -0.1);
    rejects(f, Number.POSITIVE_INFINITY);
  });

  test("measure: value + unit from the list", () => {
    const f: FieldDefinition = {
      key: "v",
      label: "Spannung",
      kind: "measure",
      units: ["V", "mV"],
      max: 1000,
    };
    accepts(f, { value: 18, unit: "V" });
    accepts(f, { value: "", unit: "V" }, undefined);
    rejects(f, { value: 18, unit: "A" });
    rejects(f, { value: 2000, unit: "V" });
    rejects(f, 18);
  });

  test("boolean is never required", () => {
    const f: FieldDefinition = { key: "b", label: "B", kind: "boolean", required: true };
    accepts(f, true);
    accepts(f, false);
    accepts(f, undefined, undefined);
    rejects(f, "yes");
  });

  test("date: YYYY-MM-DD, real calendar dates, min/max", () => {
    const f: FieldDefinition = { key: "d", label: "D", kind: "date", min: "2000-01-01" };
    accepts(f, "2024-02-29");
    rejects(f, "2023-02-29");
    rejects(f, "2024-2-1");
    rejects(f, "01.02.2024");
    rejects(f, "1999-12-31");
  });

  test("select and multiselect: only listed options", () => {
    const s: FieldDefinition = {
      key: "s",
      label: "S",
      kind: "select",
      options: ["Gebunden", "E-Book"],
    };
    accepts(s, "E-Book");
    rejects(s, "Hörbuch");
    const ms: FieldDefinition = {
      key: "m",
      label: "M",
      kind: "multiselect",
      options: ["Sommer", "Winter"],
    };
    accepts(ms, ["Winter"]);
    accepts(ms, [], undefined);
    rejects(ms, ["Herbst"]);
    rejects(ms, ["Winter", "Winter"]);
    rejects({ ...ms, required: true }, []);
  });

  test("url: absolute http(s) only", () => {
    const f: FieldDefinition = { key: "u", label: "U", kind: "url", multiple: true };
    accepts(f, ["https://example.org/a"]);
    rejects(f, ["javascript:alert(1)"]);
    rejects(f, ["example.org"]);
  });

  test("isbn: checksum and normalization", () => {
    const f: FieldDefinition = { key: "i", label: "ISBN", kind: "isbn" };
    accepts(f, "978-3-16-148410-0", "9783161484100");
    accepts(f, "3-499-13599-x", "349913599X");
    rejects(f, "978-3-16-148410-1");
    rejects(f, "3-499-13599-1");
    rejects(f, "12345");
    expect(isValidIsbn("0306406152")).toBe(true);
    expect(isValidIsbn("0306406153")).toBe(false);
    expect(normalizeIsbn(" 978 3 16 ")).toBe("978316");
  });

  test("barcode", () => {
    const f: FieldDefinition = { key: "c", label: "C", kind: "barcode" };
    accepts(f, "4006381333931");
    rejects(f, "40 06");
  });

  test("color: #rrggbb, lowercased", () => {
    const f: FieldDefinition = { key: "c", label: "Farbe", kind: "color" };
    accepts(f, "#1F4E8C", "#1f4e8c");
    rejects(f, "blau");
    rejects(f, "#fff");
  });

  test("size: system from the list, value valid for the system", () => {
    const f: FieldDefinition = {
      key: "s",
      label: "Größe",
      kind: "size",
      systems: ["child", "shoe_eu"],
    };
    accepts(f, { system: "child", value: "128" });
    accepts(f, { system: "shoe_eu", value: "42.5" });
    accepts(f, { system: "child", value: "" }, undefined);
    rejects(f, { system: "child", value: "129" });
    rejects(f, { system: "clothing_letter", value: "M" });
    rejects(f, "128");
  });

  test("user and item references are ids, optionally multiple", () => {
    const u: FieldDefinition = { key: "u", label: "U", kind: "user", multiple: true };
    accepts(u, ["a", "b"]);
    rejects(u, ["a", "a"]);
    rejects(u, [1]);
    const i: FieldDefinition = { key: "i", label: "I", kind: "item" };
    accepts(i, "0190-abc");
    rejects(i, ["x"]);
  });
});

describe("attributes schema", () => {
  const fields: FieldDefinition[] = [
    { key: "authors", label: "Autor(en)", kind: "text", multiple: true, required: true },
    { key: "year", label: "Jahr", kind: "integer", min: 1450 },
    { key: "old", label: "Alt", kind: "integer", required: true, hidden: true },
  ];

  test("validates active fields, drops empties, passes legacy keys through", () => {
    const s = buildAttributesSchema(fields);
    const r = s.safeParse({ authors: ["Ende"], year: "", old: "kaputt", zzz: 1 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ authors: ["Ende"], old: "kaputt", zzz: 1 });
    const bad = s.safeParse({ year: 1000 });
    expect(bad.success).toBe(false);
    if (!bad.success)
      expect(bad.error.issues.map((i) => i.path[0]).sort()).toEqual(["authors", "year"]);
  });

  test("hidden fields are neither required nor validated", () => {
    expect(buildAttributesSchema(fields).safeParse({ authors: ["x"] }).success).toBe(true);
  });

  test("prepareAttributes keeps legacy values from the stored item, not the client", () => {
    const previous = { authors: ["A"], old: 7, gone: "weg" };
    const r = prepareAttributes(fields, { authors: ["B"], old: 99, injected: "x" }, previous);
    expect(r).toEqual({ ok: true, attributes: { authors: ["B"], old: 7, gone: "weg" } });
    const cleaned = prepareAttributes(fields, { authors: ["B"], gone: null }, previous);
    expect(cleaned).toEqual({ ok: true, attributes: { authors: ["B"], old: 7 } });
    const failed = prepareAttributes(fields, { year: 3 }, previous);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(Object.keys(failed.errors).sort()).toEqual(["authors", "year"]);
  });

  test("German error messages", () => {
    expect(validateFieldValue(fields[0]!, [])).toBe("Bitte ausfüllen.");
    expect(validateFieldValue(fields[1]!, 1000)).toBe("Der Wert muss mindestens 1.450 sein.");
  });
});

describe("definition schema", () => {
  test("accepts every kind with its options", () => {
    const all: unknown[] = [
      { key: "a", label: "A", kind: "text", multiple: true },
      { key: "b", label: "B", kind: "longtext" },
      { key: "c", label: "C", kind: "integer", min: 1, max: 2 },
      { key: "d", label: "D", kind: "decimal", unit: "kg" },
      { key: "e", label: "E", kind: "measure", units: ["V"] },
      { key: "f", label: "F", kind: "boolean" },
      { key: "g", label: "G", kind: "date", min: "2020-01-01" },
      { key: "h", label: "H", kind: "select", options: ["x"] },
      { key: "i", label: "I", kind: "multiselect", options: ["x", "y"] },
      { key: "j", label: "J", kind: "url" },
      { key: "k", label: "K", kind: "isbn", lookup: ["dnb"] },
      { key: "l", label: "L", kind: "barcode" },
      { key: "m", label: "M", kind: "color" },
      { key: "n", label: "N", kind: "size", systems: ["child"] },
      { key: "o", label: "O", kind: "user", multiple: true },
      { key: "p", label: "P", kind: "item" },
    ];
    expect(fieldListSchema.safeParse(all).success).toBe(true);
  });

  test("rejects bad keys, empty option lists, min > max, duplicate keys", () => {
    const bad = (v: unknown) => expect(fieldDefinitionSchema.safeParse(v).success).toBe(false);
    bad({ key: "Voltage", label: "x", kind: "text" });
    bad({ key: "1a", label: "x", kind: "text" });
    bad({ key: "a", label: " ", kind: "text" });
    bad({ key: "a", label: "x", kind: "select", options: [] });
    bad({ key: "a", label: "x", kind: "select", options: ["x", "x"] });
    bad({ key: "a", label: "x", kind: "integer", min: 5, max: 1 });
    bad({ key: "a", label: "x", kind: "measure", units: [] });
    bad({ key: "a", label: "x", kind: "size", systems: [] });
    bad({ key: "a", label: "x", kind: "nope" });
    expect(
      fieldListSchema.safeParse([
        { key: "a", label: "x", kind: "text" },
        { key: "a", label: "y", kind: "text" },
      ]).success,
    ).toBe(false);
  });

  test("parseStoredFields skips junk", () => {
    expect(parseStoredFields([{ key: "a", label: "A", kind: "text" }, { kind: "?" }, 1])).toEqual([
      { key: "a", label: "A", kind: "text" },
    ]);
    expect(parseStoredFields("nope")).toEqual([]);
  });
});
