import { describe, expect, test } from "bun:test";
import { flattenAttributesForSearch, formatAttributeValue, splitAttributes } from "./display";
import type { FieldDefinition } from "./fields";
import { planAttributes, planNeedsConfirmation, planTypeChange } from "./migrate";

describe("planAttributes", () => {
  test("kind change: fitting values kept, convertible converted, others removed", () => {
    const target: FieldDefinition[] = [
      { key: "voltage", label: "Spannung", kind: "integer" },
      { key: "tags", label: "Tags", kind: "text", multiple: true },
      { key: "note", label: "Notiz", kind: "text" },
    ];
    const p = planAttributes(target, {
      voltage: { value: 18, unit: "V" },
      tags: "rot",
      note: "ok",
    });
    expect(p.kept).toEqual(["note"]);
    expect(p.converted.sort()).toEqual(["tags", "voltage"]);
    expect(p.attributes).toEqual({ voltage: 18, tags: ["rot"], note: "ok" });
    const lost = planAttributes(target, { voltage: "zwölf" });
    expect(lost.removed).toEqual(["voltage"]);
    expect(lost.attributes).toEqual({});
    expect(planNeedsConfirmation(lost)).toBe(true);
  });

  test("hidden and unknown keys become legacy, never lost", () => {
    const target: FieldDefinition[] = [{ key: "a", label: "A", kind: "integer", hidden: true }];
    const p = planAttributes(target, { a: "x", b: 1 });
    expect(p.legacy.sort()).toEqual(["a", "b"]);
    expect(p.attributes).toEqual({ a: "x", b: 1 });
    expect(planNeedsConfirmation(p)).toBe(false);
  });

  test("tightened min/max or required never deletes data", () => {
    const target: FieldDefinition[] = [
      { key: "year", label: "Jahr", kind: "integer", min: 1900, required: true },
      { key: "series", label: "Reihe", kind: "text", required: true },
    ];
    const p = planAttributes(target, { year: 1850 });
    expect(p.kept).toEqual(["year"]);
    expect(p.missingRequired).toEqual(["series"]);
  });

  test("removed select option drops the value", () => {
    const target: FieldDefinition[] = [
      { key: "f", label: "Format", kind: "select", options: ["A"] },
    ];
    expect(planAttributes(target, { f: "B" }).removed).toEqual(["f"]);
  });

  test("type change: shared keys carry over, the rest become legacy", () => {
    const tool: FieldDefinition[] = [
      { key: "brand", label: "Marke", kind: "text" },
      { key: "serial", label: "Seriennummer", kind: "text" },
    ];
    const p = planTypeChange(tool, { brand: "Bosch", isbn: "9783161484100", serial: 123 });
    expect(p.kept).toEqual(["brand"]);
    expect(p.converted).toEqual(["serial"]);
    expect(p.legacy).toEqual(["isbn"]);
    expect(p.attributes).toEqual({ brand: "Bosch", isbn: "9783161484100", serial: "123" });
  });
});

describe("display and search text", () => {
  const fields: FieldDefinition[] = [
    { key: "voltage", label: "Spannung", kind: "measure", units: ["V"] },
    { key: "size", label: "Größe", kind: "size", systems: ["shoe_eu"] },
    { key: "warranty", label: "Garantie", kind: "date" },
    { key: "cordless", label: "Akku", kind: "boolean" },
    { key: "owner", label: "Gehört", kind: "user" },
    { key: "old", label: "Alt", kind: "text", hidden: true },
  ];
  const attrs = {
    voltage: { value: 18.5, unit: "V" },
    size: { system: "shoe_eu", value: "42.5" },
    warranty: "2027-03-01",
    cordless: true,
    owner: "u1",
    old: "Säge",
    gone: 5,
  };

  test("formats values in German", () => {
    expect(formatAttributeValue(fields[0]!, attrs.voltage)).toBe("18,5 V");
    expect(formatAttributeValue(fields[1]!, attrs.size)).toBe("42,5 (Schuhgröße (EU))");
    expect(formatAttributeValue(fields[2]!, attrs.warranty)).toBe("01.03.2027");
    expect(formatAttributeValue(fields[3]!, true)).toBe("Ja");
    expect(formatAttributeValue(fields[4]!, "u1", { userName: () => "Lena" })).toBe("Lena");
  });

  test("splitAttributes separates legacy values", () => {
    const { active, legacy } = splitAttributes(fields, attrs);
    expect(active.map((e) => e.key)).toEqual(["voltage", "size", "warranty", "cordless", "owner"]);
    expect(legacy.map((e) => [e.key, e.label])).toEqual([
      ["old", "Alt"],
      ["gone", "gone"],
    ]);
  });

  test("flattenAttributesForSearch normalizes text and resolves names", () => {
    const s = flattenAttributesForSearch(fields, attrs, { userName: () => "Lena" });
    expect(s).toBe("18,5 v 42,5 2027-03-01 01.03.2027 akku lena sage 5");
  });
});
