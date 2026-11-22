import { describe, expect, it } from "bun:test";
import { diffFields } from "./diff";

describe("diffFields", () => {
  it("returns an empty diff for unchanged objects", () => {
    expect(diffFields({}, {})).toEqual({});
    expect(diffFields({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual({});
  });

  it("treats null, undefined and missing keys as the same empty value", () => {
    expect(diffFields({ a: null, b: undefined }, { a: undefined })).toEqual({});
    expect(diffFields({}, { a: null, b: undefined })).toEqual({});
  });

  it("reports empty values as null when a field changed", () => {
    expect(diffFields({ a: undefined }, { a: 5 })).toEqual({ a: { from: null, to: 5 } });
    expect(diffFields({ a: null }, { a: 5 })).toEqual({ a: { from: null, to: 5 } });
    expect(diffFields({ a: 5 }, {})).toEqual({ a: { from: 5, to: null } });
  });

  it("detects changed, added and removed keys", () => {
    expect(diffFields({ a: 1 }, { a: 2 })).toEqual({ a: { from: 1, to: 2 } });
    expect(diffFields({ a: 1 }, { a: 1, b: 2 })).toEqual({ b: { from: null, to: 2 } });
    expect(diffFields({ a: 1, b: 2 }, { a: 1 })).toEqual({ b: { from: 2, to: null } });
  });

  it("sorts result keys alphabetically", () => {
    const result = diffFields({ z: 0, a: 0, m: 0 }, { z: 1, a: 1, m: 1 });
    expect(Object.keys(result)).toEqual(["a", "m", "z"]);
  });

  it("compares nested plain objects structurally", () => {
    expect(diffFields({ a: { x: 1, y: [1, 2] } }, { a: { x: 1, y: [1, 2] } })).toEqual({});
    expect(diffFields({ a: { x: 1 } }, { a: { x: 2 } })).toEqual({
      a: { from: { x: 1 }, to: { x: 2 } },
    });
    expect(diffFields({ a: { x: 1 } }, { a: { x: 1, y: 2 } })).toEqual({
      a: { from: { x: 1 }, to: { x: 1, y: 2 } },
    });
  });

  it("treats null and undefined as equal when nested", () => {
    expect(diffFields({ a: { x: null, y: 1 } }, { a: { x: undefined, y: 1 } })).toEqual({});
    expect(diffFields({ a: [null] }, { a: [undefined] })).toEqual({});
  });

  it("is sensitive to array order and length", () => {
    expect(diffFields({ a: [1, 2] }, { a: [2, 1] })).toEqual({ a: { from: [1, 2], to: [2, 1] } });
    expect(diffFields({ a: [1, 2] }, { a: [1, 2, 3] })).toEqual({
      a: { from: [1, 2], to: [1, 2, 3] },
    });
    expect(diffFields({ a: [{ id: 1 }] }, { a: [{ id: 1 }] })).toEqual({});
  });

  it("compares Dates by time value", () => {
    const first = new Date("2026-01-01T00:00:00Z");
    expect(diffFields({ d: first }, { d: new Date("2026-01-01T00:00:00Z") })).toEqual({});
    const result = diffFields({ d: first }, { d: new Date("2026-01-02T00:00:00Z") });
    expect(result.d?.from).toEqual(first);
    expect(result.d?.to).toEqual(new Date("2026-01-02T00:00:00Z"));
  });

  it("compares non-plain objects by reference and NaN by value", () => {
    const map = new Map<string, number>([["k", 1]]);
    expect(diffFields({ m: map }, { m: map })).toEqual({});
    expect(diffFields({ n: Number.NaN }, { n: Number.NaN })).toEqual({});
  });
});
