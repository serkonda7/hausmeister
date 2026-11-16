// Phase 0 only: a tiny table so Litestream and the restore test have real data.
// Drizzle and the real schema arrive with the MVP.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

let db: Database | undefined;

export function getDb(): Database {
  if (db) return db;
  const path = process.env.DATABASE_PATH ?? "./data/db/app.sqlite";
  mkdirSync(dirname(path), { recursive: true });
  db = new Database(path, { create: true });
  db.exec(
    "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;",
  );
  db.exec(
    "CREATE TABLE IF NOT EXISTS boots (id INTEGER PRIMARY KEY, at TEXT NOT NULL)",
  );
  db.query("INSERT INTO boots (at) VALUES (?)").run(new Date().toISOString());
  return db;
}

export function bootCount(): number {
  return (
    getDb().query("SELECT count(*) AS n FROM boots").get() as { n: number }
  ).n;
}

export function sqliteVersion(): string {
  return (getDb().query("SELECT sqlite_version() AS v").get() as { v: string })
    .v;
}
