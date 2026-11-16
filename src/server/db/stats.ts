import { count } from "drizzle-orm";
import type { AppDb } from "./client";
import { boots, items } from "./schema";

/** Numbers for /health and the restore test. */
export function dbStats(db: AppDb) {
  const { v: sqlite } = db.$client.query("SELECT sqlite_version() AS v").get() as { v: string };
  const b = db.select({ n: count() }).from(boots).get()?.n ?? 0;
  const i = db.select({ n: count() }).from(items).get()?.n ?? 0;
  return { sqlite, boots: b, items: i };
}
