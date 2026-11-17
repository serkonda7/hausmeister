import { expect, test } from "bun:test";
import { formatHistoryEntry, type HistoryContext } from "./history-format";
import type { HistoryEntry } from "./types";

const ctx: HistoryContext = {
  names: {
    users: { u1: "Anna" },
    groups: { g1: "Kinder" },
    items: { i1: "Werkzeugkiste" },
    locations: { l1: "Garage" },
  },
  fields: [{ key: "season", label: "Saison", kind: "select", options: ["Sommer", "Winter"] }],
  typeName: (id) => (id === "t1" ? "Werkzeug" : undefined),
};

const entry = (action: string, diff: HistoryEntry["diff"]): HistoryEntry => ({
  id: "e",
  at: new Date(0),
  action,
  actor: null,
  diff,
});

test("base fields, places, status and attributes become labelled lines", () => {
  const f = formatHistoryEntry(
    entry("item.updated", {
      name: { from: "Alt", to: "Neu" },
      locationId: { from: null, to: "l1" },
      containerItemId: { from: "i1", to: "secret" },
      status: { from: "available", to: "lost" },
      "attributes.season": { from: null, to: "Winter" },
    }),
    ctx,
  );
  expect(f.lines.map((l) => `${l.label}: ${l.from} → ${l.to}`)).toEqual([
    "Name: Alt → Neu",
    "Ort: — → Garage",
    "Behälter: Werkzeugkiste → Nicht sichtbarer Behälter",
    "Status: Verfügbar → Verloren",
    "Saison: — → Winter",
  ]);
});

test("owner kind and id merge into one line", () => {
  const f = formatHistoryEntry(
    entry("item.owner_changed", {
      ownerKind: { from: "household", to: "group" },
      ownerId: { from: null, to: "g1" },
    }),
    ctx,
  );
  expect(f.lines).toEqual([{ key: "owner", label: "Besitzer", from: "Haushalt", to: "Kinder" }]);
});

test("grant events get a summary with the principal's name", () => {
  const f = formatHistoryEntry(
    entry("item.grant_set", {
      principalKind: "user",
      principalId: "u1",
      level: { from: null, to: "use" },
    }),
    ctx,
  );
  expect(f.summary).toBe("für Anna");
  expect(f.lines[0]).toMatchObject({ from: "—", to: "Benutzen" });
});

test("type migrations expand nested attribute diffs", () => {
  const f = formatHistoryEntry(
    entry("item.attributes_migrated", {
      typeId: "t1",
      removed: ["x"],
      attributes: { season: { from: "Sommer", to: null } },
    }),
    ctx,
  );
  expect(f.lines).toEqual([{ key: "attributes.season", label: "Saison", from: "Sommer", to: "—" }]);
});
