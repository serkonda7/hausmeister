import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { closeDatabase, KEEP_SNAPSHOTS, openDatabase, pruneSnapshots } from "./client";
import { items, itemTypes, settings, users } from "./schema";
import { healthStatus } from "./stats";
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
    // /health tells signed-out callers only `ok` and `boots`: no item count, no versions.
    expect(healthStatus(db)).toEqual({ ok: true, boots: 0 });
  });
});

describe("pre-migration snapshots (DESIGN §8.6)", () => {
  const { mkdtempSync, readdirSync, writeFileSync, rmSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");

  test("a Phase 0 database (only `boots`) gets a snapshot; only the newest few are kept", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-snap-"));
    try {
      const path = join(dir, "app.sqlite");
      // Phase 0 database: one table, no migrations recorded.
      const p0 = new Database(path);
      p0.exec("CREATE TABLE boots (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL)");
      p0.exec("INSERT INTO boots (at) VALUES ('2026-01-01T00:00:00Z')");
      p0.close();
      // Older snapshots from earlier upgrades, plus unrelated files that must survive.
      const old = [1, 2, 3, 4].map((n) => `app.sqlite.pre-migrate-2026-0${n}-01T00-00-00-000Z.bak`);
      for (const f of [...old, "other.sqlite.pre-migrate-2026-01-01T00-00-00-000Z.bak", "x.bak"])
        writeFileSync(join(dir, f), "");

      const db = openDatabase(path, { snapshotBeforeMigrate: true });
      expect(healthStatus(db).boots).toBe(1);
      closeDatabase(db);

      const files = (readdirSync(dir) as string[]).sort();
      const snaps = files.filter((f) => f.startsWith("app.sqlite.pre-migrate-"));
      expect(snaps).toHaveLength(KEEP_SNAPSHOTS);
      expect(snaps).toContain(old[3]!);
      expect(snaps).not.toContain(old[0]!);
      expect(files).toContain("other.sqlite.pre-migrate-2026-01-01T00-00-00-000Z.bak");
      expect(files).toContain("x.bak");
      // The newest snapshot is the Phase 0 database itself and opens fine.
      const newest = snaps.at(-1)!;
      expect(newest > old[3]!).toBe(true);
      const s = new Database(join(dir, newest), { readonly: true });
      expect(s.query("SELECT count(*) AS n FROM boots").get()).toEqual({ n: 1 });
      s.close();
      // Closing checkpointed the WAL: no -wal file is left behind.
      expect(files.filter((f) => f.endsWith("-wal") || f.endsWith("-shm"))).toEqual([]);

      // Up to date: reopening takes no new snapshot.
      closeDatabase(openDatabase(path, { snapshotBeforeMigrate: true }));
      expect(
        (readdirSync(dir) as string[]).filter((f) => f.startsWith("app.sqlite.pre-")).sort(),
      ).toEqual(snaps);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("pruneSnapshots keeps everything when there are few", () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-snap-"));
    try {
      writeFileSync(join(dir, "app.sqlite.pre-migrate-a.bak"), "");
      expect(pruneSnapshots(join(dir, "app.sqlite"), 3)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
