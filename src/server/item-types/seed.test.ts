import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { resolveFields } from "~/lib/item-types/tree";
import { events, itemTypes } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { seedStarterTemplates, TEMPLATES_SEEDED_ACTION } from "./seed";
import { loadTypes } from "./service";
import { STARTER_TEMPLATES } from "./templates";

test("seeds the six templates (incl. Tool -> Power tool) once", () => {
  const db = createTestDb();
  expect(seedStarterTemplates(db)).toBe(true);
  const types = loadTypes(db);
  expect(types.length).toBe(STARTER_TEMPLATES.length);
  expect(
    types
      .filter((t) => !t.parentId)
      .map((t) => t.name)
      .sort(),
  ).toEqual(["Buch", "Elektronik", "Ersatzteil", "Kleidung", "Verbrauchsmaterial", "Werkzeug"]);
  const power = types.find((t) => t.key === "power_tool")!;
  expect(types.find((t) => t.id === power.parentId)?.key).toBe("tool");
  expect(resolveFields(types, power.id).map((f) => f.key)).toEqual([
    "brand",
    "model",
    "serial",
    "power_source",
    "battery_system",
    "voltage",
  ]);
  // every template field survives the strict schema (no junk dropped on load)
  for (const t of STARTER_TEMPLATES)
    expect(types.find((x) => x.key === t.key)?.fields.length).toBe(t.fields.length);
  expect(seedStarterTemplates(db)).toBe(false);
  expect(loadTypes(db).length).toBe(STARTER_TEMPLATES.length);
});

test("deleted templates do not come back", () => {
  const db = createTestDb();
  seedStarterTemplates(db);
  db.delete(itemTypes).where(eq(itemTypes.key, "power_tool")).run();
  db.delete(itemTypes).where(eq(itemTypes.key, "book")).run();
  expect(seedStarterTemplates(db)).toBe(false);
  expect(loadTypes(db).some((t) => t.key === "book")).toBe(false);
  // even when every type is gone
  db.delete(itemTypes).run();
  expect(seedStarterTemplates(db)).toBe(false);
  expect(loadTypes(db)).toEqual([]);
});

test("an existing instance with types gets only the marker", () => {
  const db = createTestDb();
  db.insert(itemTypes).values({ key: "own", name: "Eigener Typ", fields: [] }).run();
  expect(seedStarterTemplates(db)).toBe(false);
  expect(loadTypes(db).map((t) => t.key)).toEqual(["own"]);
  expect(
    db.select().from(events).where(eq(events.action, TEMPLATES_SEEDED_ACTION)).all().length,
  ).toBe(1);
});
