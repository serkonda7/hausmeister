// A consistent read view of the database for the length of one export.
// The app keeps running while a large export streams for minutes, so the export
// reads through its own read-only connection inside one read transaction: in
// WAL mode that transaction sees the database as of its first read, while the
// app's connection keeps writing (readers never block writers, and vice
// versa). Every page of the export is read from that snapshot, so items,
// attachments and events agree with each other.
// Cost: while the snapshot is open, checkpoints cannot move past it and the WAL
// file grows by whatever the app writes meanwhile; it shrinks again after the
// export ends. Attachment files are content-addressed and immutable, so the
// only race left is a blob deleted by gc after its row was deleted; the export
// marks such a file as missing instead of failing.
// In-memory databases (tests) cannot be opened twice; there the export reads
// the given connection directly, without a snapshot.
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { AppDb } from "../db/client";
import * as schema from "../db/schema";

export type Snapshot = { db: AppDb; isolated: boolean; close(): void };

function fileOf(db: AppDb): string | null {
  const name = db.$client.filename;
  return !name || name === ":memory:" ? null : name;
}

export function openSnapshot(db: AppDb): Snapshot {
  const file = fileOf(db);
  if (!file) return { db, isolated: false, close() {} };
  const sqlite = new Database(file, { readonly: true, strict: true });
  try {
    sqlite.exec("PRAGMA busy_timeout = 5000");
    sqlite.exec("PRAGMA query_only = ON");
    sqlite.exec("BEGIN");
    // A deferred transaction takes its snapshot at the first read.
    sqlite.query("SELECT count(*) FROM items").get();
  } catch (err) {
    sqlite.close();
    throw err;
  }
  const snap = drizzle({ client: sqlite, schema }) as AppDb;
  let closed = false;
  return {
    db: snap,
    isolated: true,
    close() {
      if (closed) return;
      closed = true;
      try {
        sqlite.exec("COMMIT");
      } catch {
        // nothing to commit in a read transaction that failed
      }
      sqlite.close();
    },
  };
}
