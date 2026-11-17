import { expect, test } from "bun:test";
import { formatHistoryEntry, groupFileRuns, type HistoryContext } from "./history-format";
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

test("creation entries are compact: the name as summary, initial values collapsed", () => {
  const f = formatHistoryEntry(
    entry("item.created", {
      name: { from: null, to: "Akkuschrauber" },
      locationId: { from: null, to: "l1" },
      "attributes.season": { from: null, to: "Winter" },
    }),
    ctx,
  );
  expect(f.summary).toBe("Akkuschrauber");
  expect(f.collapsed).toBe(true);
  expect(f.lines.map((l) => l.key)).toEqual(["locationId", "attributes.season"]);
  expect(
    formatHistoryEntry(entry("item.updated", { name: { from: "a", to: "b" } }), ctx).collapsed,
  ).toBe(false);
});

test("a burst of uploads by one person becomes one entry with the file names", () => {
  const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 12, min));
  const ev = (id: string, action: string, min: number, actor: string, name: string) => {
    const e: HistoryEntry = {
      id,
      at: at(min),
      action,
      actor: { id: actor, name: actor },
      diff: { originalName: name },
    };
    return { e, f: formatHistoryEntry(e, ctx) };
  };
  const list = [
    ev("5", "attachment.added", 30, "a", "d.png"), // newest first
    ev("4", "attachment.added", 29, "a", "c.png"),
    ev("3", "attachment.added", 28, "a", "b.png"),
    ev("2", "attachment.added", 27, "b", "x.png"), // another person
    ev("1", "attachment.added", 5, "b", "y.png"), // too far apart
  ];
  const g = groupFileRuns(list);
  expect(g.map((x) => x.e.id)).toEqual(["5", "2", "1"]);
  expect(g[0]!.f.summary).toBe("3 Dateien");
  expect(g[0]!.f.collapsed).toBe(true);
  expect(g[0]!.f.lines.map((l) => l.to)).toEqual(["d.png", "c.png", "b.png"]);
  expect(g[1]!.f.summary).toBe("x.png");
});
