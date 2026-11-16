import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type BunSQLiteDatabase, drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getEnv } from "../env";
import * as schema from "./schema";

export type AppDb = BunSQLiteDatabase<typeof schema> & { $client: Database };
/** The `tx` handed to `db.transaction((tx) => …)`. */
export type AppTx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
/** Functions that work both standalone and inside a caller's transaction take this. */
export type DbOrTx = AppDb | AppTx;

/**
 * Where the generated SQL migrations live. In the repo and in the Docker image
 * (WORKDIR /app) that is ./drizzle relative to the working directory.
 */
export function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return resolve(process.env.MIGRATIONS_DIR);
  const fromCwd = resolve(process.cwd(), "drizzle");
  if (existsSync(join(fromCwd, "meta", "_journal.json"))) return fromCwd;
  // Fallback for tests run from another cwd: the repo root next to src/.
  return resolve(import.meta.dir, "../../../drizzle");
}

/**
 * Opens a SQLite database with the app's pragmas and applies all pending
 * migrations. `path` may be ":memory:".
 */
export function openDatabase(path: string, opts: { snapshotBeforeMigrate?: boolean } = {}): AppDb {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path, { create: true, strict: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec("PRAGMA busy_timeout = 5000");
  sqlite.exec("PRAGMA synchronous = NORMAL");
  const db = drizzle({ client: sqlite, schema }) as AppDb;

  const folder = migrationsDir();
  if (opts.snapshotBeforeMigrate && path !== ":memory:") snapshotIfPending(sqlite, path, folder);
  migrate(db, { migrationsFolder: folder });
  return db;
}

/** DESIGN §8.6: take a DB snapshot before migrations run on an existing database. */
function snapshotIfPending(sqlite: Database, path: string, folder: string) {
  const journal = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: unknown[];
  };
  const hasTable = sqlite
    .query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
    .get();
  const hasData = sqlite.query("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1").get();
  if (!hasData) return; // fresh database, nothing to protect
  const applied = hasTable
    ? (sqlite.query("SELECT count(*) AS n FROM __drizzle_migrations").get() as { n: number }).n
    : 0;
  if (applied >= journal.entries.length) return;
  const target = `${path}.pre-migrate-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  sqlite.query("VACUUM INTO ?").run(target);
  console.log(`[db] snapshot before migrations: ${target}`);
}

let instance: AppDb | undefined;

/**
 * The process-wide database (DATABASE_PATH). The first call opens it, runs
 * migrations and records a row in `boots`. Server code imports this; tests use
 * `createTestDb()` from ./test-db instead.
 */
export function getDb(): AppDb {
  if (instance) return instance;
  const db = openDatabase(getEnv().DATABASE_PATH, { snapshotBeforeMigrate: true });
  db.insert(schema.boots).values({ at: new Date().toISOString() }).run();
  instance = db;
  return db;
}
