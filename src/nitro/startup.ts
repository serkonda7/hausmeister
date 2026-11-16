// Nitro runtime plugin: runs once when the server process starts (the app
// bundle itself is loaded lazily on the first request). Fails fast on bad
// configuration and applies pending DB migrations before any request is served.
// Uses relative imports: Nitro bundles this file outside Vite's `~` alias.
import { definePlugin } from "nitro";
import { openDatabase } from "../server/db/client";
import { getEnv } from "../server/env";

export default definePlugin(() => {
  try {
    const env = getEnv();
    openDatabase(env.DATABASE_PATH, { snapshotBeforeMigrate: true }).$client.close();
  } catch (err) {
    console.error("[startup] fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
});
