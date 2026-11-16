import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { items, itemTypes, settings, users } from "./schema";
import { dbStats } from "./stats";
import { createTestDb } from "./test-db";

describe("bundled SQLite", () => {
  test("is at least 3.45 (needed for trigram remove_diacritics)", () => {
    const db = new Database(":memory:");
    const v = (db.query("SELECT sqlite_version() AS v").get() as { v: string }).v;
    const [maj = 0, min = 0] = v.split(".").map(Number);
    expect(maj * 1000 + min).toBeGreaterThanOrEqual(3045);
  });

  test("FTS5 trigram + remove_diacritics finds German compound substrings", () => {
    const db = new Database(":memory:");
    db.exec("CREATE VIRTUAL TABLE t USING fts5(name, tokenize = 'trigram remove_diacritics 1')");
    db.exec("INSERT INTO t (name) VALUES ('Akkuschrauber'), ('Stichsäge'), ('Hammer')");
    const find = (q: string) =>
      (db.query("SELECT name FROM t WHERE t MATCH ?").all(q) as { name: string }[]).map(
        (r) => r.name,
      );
    expect(find("schrauber")).toEqual(["Akkuschrauber"]);
    expect(find("sage")).toEqual(["Stichsäge"]);
    expect(find("säge")).toEqual(["Stichsäge"]);
  });
});

describe("migrations", () => {
  test("apply to a fresh in-memory database with all MVP tables", () => {
    const db = createTestDb();
    const names = db
      .all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type IN ('table')`)
      .map((r) => r.name);
    for (const t of [
      "boots",
      "settings",
      "users",
      "sessions",
      "accounts",
      "verifications",
      "passkeys",
      "groups",
      "group_members",
      "invites",
      "item_types",
      "locations",
      "items",
      "item_grants",
      "tags",
      "item_tags",
      "attachments",
      "events",
      "jobs",
      "items_fts",
    ]) {
      expect(names).toContain(t);
    }
    expect(db.$client.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    expect(db.select().from(settings).all()).toHaveLength(1);
  });

  test("items_fts uses the trigram tokenizer from the migration", () => {
    const db = createTestDb();
    db.run(
      sql`INSERT INTO items_fts (item_id, name, description, tags, attrs) VALUES ('a', 'Akkuschrauber', '', '', ''), ('b', 'Stichsäge', '', '', '')`,
    );
    const hits = (q: string) =>
      db
        .all<{ item_id: string }>(sql`SELECT item_id FROM items_fts WHERE items_fts MATCH ${q}`)
        .map((r) => r.item_id);
    expect(hits("schrauber")).toEqual(["a"]);
    expect(hits("sage")).toEqual(["b"]);
  });

  test("items get UUIDv7 ids, defaults and enforced constraints", () => {
    const db = createTestDb();
    const u = db
      .insert(users)
      .values({ username: "anna", displayName: "Anna", authEmail: "x@users.invalid" })
      .returning()
      .get();
    const t = db.insert(itemTypes).values({ key: "tool", name: "Werkzeug" }).returning().get();
    const it = db
      .insert(items)
      .values({ typeId: t.id, name: "Bohrmaschine", createdBy: u.id })
      .returning()
      .get();
    expect(it.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(it).toMatchObject({
      ownerKind: "household",
      visibility: "household",
      quantity: 1,
      version: 1,
      attributes: {},
    });
    // owner_id must be set for user-owned items
    expect(() =>
      db.insert(items).values({ typeId: t.id, name: "x", ownerKind: "user" }).run(),
    ).toThrow();
    // foreign keys are on
    expect(() => db.insert(items).values({ typeId: "nope", name: "x" }).run()).toThrow();
    expect(dbStats(db)).toMatchObject({ items: 1, boots: 0 });
    expect(dbStats(db).sqlite).toMatch(/^3\./);
  });
});
