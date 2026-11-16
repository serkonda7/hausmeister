import { describe, expect, test } from "bun:test";
import type { FieldDefinition } from "./fields";
import {
  ancestorIds,
  buildTree,
  flattenTree,
  resolveFields,
  typeAndDescendantIds,
  validateTypeTree,
  wouldCreateCycle,
} from "./tree";

const f = (key: string, extra: Partial<FieldDefinition> = {}) =>
  ({ key, label: key, kind: "text", ...extra }) as FieldDefinition;

const types = [
  { id: "tool", parentId: null, name: "Werkzeug", fields: [f("brand"), f("model")] },
  { id: "power", parentId: "tool", name: "Elektrowerkzeug", fields: [f("voltage")] },
  { id: "cordless", parentId: "power", name: "Akkuwerkzeug", fields: [f("battery")] },
  { id: "book", parentId: null, name: "Buch", fields: [f("isbn")] },
];

describe("inheritance", () => {
  test("resolveFields: ancestors first, flagged as inherited", () => {
    const r = resolveFields(types, "cordless");
    expect(r.map((x) => x.key)).toEqual(["brand", "model", "voltage", "battery"]);
    expect(r.map((x) => x.inherited)).toEqual([true, true, true, false]);
    expect(r[0]!.sourceTypeId).toBe("tool");
  });

  test("descendants include the type itself and all subtypes", () => {
    expect(typeAndDescendantIds(types, "tool").sort()).toEqual(["cordless", "power", "tool"]);
    expect(typeAndDescendantIds(types, "book")).toEqual(["book"]);
    expect(ancestorIds(types, "cordless")).toEqual(["tool", "power"]);
  });

  test("key collisions with an ancestor are reported, hidden ancestor fields included", () => {
    expect(validateTypeTree(types)).toEqual([]);
    const clash = types.map((t) => (t.id === "cordless" ? { ...t, fields: [f("brand")] } : t));
    expect(validateTypeTree(clash)).toEqual([
      { code: "key_collision", typeId: "cordless", key: "brand", ancestorId: "tool" },
    ]);
    const hidden = types.map((t) =>
      t.id === "tool" ? { ...t, fields: [f("battery", { hidden: true })] } : t,
    );
    expect(validateTypeTree(hidden)[0]).toMatchObject({ code: "key_collision", key: "battery" });
  });

  test("cycles are detected and never loop", () => {
    expect(wouldCreateCycle(types, "tool", "cordless")).toBe(true);
    expect(wouldCreateCycle(types, "tool", "tool")).toBe(true);
    expect(wouldCreateCycle(types, "cordless", "book")).toBe(false);
    const cyclic = types.map((t) => (t.id === "tool" ? { ...t, parentId: "cordless" } : t));
    expect(validateTypeTree(cyclic).filter((p) => p.code === "cycle").length).toBe(3);
    expect(resolveFields(cyclic, "tool").length).toBeGreaterThan(0);
  });

  test("buildTree sorts by German name and flattens depth-first", () => {
    const flat = flattenTree(buildTree(types));
    expect(flat.map((n) => [n.id, n.depth])).toEqual([
      ["book", 0],
      ["tool", 0],
      ["power", 1],
      ["cordless", 2],
    ]);
  });
});
