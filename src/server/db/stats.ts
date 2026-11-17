import { count } from "drizzle-orm";
import type { AppDb } from "./client";
import { boots } from "./schema";

/**
 * The public, unauthenticated /health answer. Only what the Docker healthcheck
 * (status code) and deploy/restore-test.sh (`ok`, `boots`) need: no item
 * counts (private items included) and no runtime versions. The restore test
 * counts items directly in the databases.
 */
export function healthStatus(db: AppDb): { ok: true; boots: number } {
  return { ok: true, boots: db.select({ n: count() }).from(boots).get()?.n ?? 0 };
}
