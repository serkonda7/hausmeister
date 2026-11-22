import { describe, expect, test } from "bun:test";
import { baseValuesFromItem, changedKeys, emptyBaseValues, parseBaseValues } from "./form";
import type { ItemDetail } from "./types";

describe("parseBaseValues", () => {
  test("converts German numbers and money, empty text to null", () => {
    const r = parseBaseValues(
      {
        ...emptyBaseValues(),
        name: " Bohrer ",
        quantity: "1,5",
        minQuantity: "",
        price: "1.234,56",
      },
      { withPrice: true },
    );
    expect(r).toEqual({
      ok: true,
      data: {
        name: "Bohrer",
        description: null,
        quantity: 1.5,
        unit: null,
        minQuantity: null,
        condition: null,
        acquiredOn: null,
        priceCents: 123456,
        barcode: null,
        tags: [],
      },
    });
  });

  test("reports a German error per bad field", () => {
    const r = parseBaseValues(
      { ...emptyBaseValues(), name: "", quantity: "viel", acquiredOn: "2024-02-30", price: "x" },
      { withPrice: true },
    );
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(Object.keys(r.errors).sort()).toEqual(["acquiredOn", "name", "price", "quantity"]);
  });

  test("leaves price out when the caller may not see money", () => {
    const r = parseBaseValues(
      { ...emptyBaseValues(), name: "x", price: "5" },
      { withPrice: false },
    );
    expect(r.ok && "priceCents" in r.data).toBe(false);
  });
});

test("baseValuesFromItem formats numbers and price for the inputs", () => {
  const v = baseValuesFromItem({
    item: {
      name: "Schrauben",
      description: null,
      quantity: 1250,
      unit: "Stück",
      minQuantity: 100.5,
      condition: null,
      acquiredOn: "2024-01-02",
      barcode: null,
      priceCents: 1999,
      currency: "EUR",
      level: "edit",
    } as unknown as ItemDetail["item"],
    tags: [{ id: "t", name: "Keller", color: null }],
  });
  expect(v).toMatchObject({
    quantity: "1250",
    minQuantity: "100,5",
    price: "19,99",
    acquiredOn: "2024-01-02",
    tags: ["Keller"],
  });
});

test("changedKeys compares base values and attributes", () => {
  const a = { base: emptyBaseValues(), attributes: { size: "M", color: "rot" } };
  const b = {
    base: { ...emptyBaseValues(), name: "neu", tags: ["x"] },
    attributes: { size: "L", extra: 1 },
  };
  expect(changedKeys(a, b)).toEqual({
    base: ["name", "tags"],
    attributes: ["size", "color", "extra"],
  });
  expect(changedKeys(a, a)).toEqual({ base: [], attributes: [] });
});
