// Nitro runtime plugin: runs once when the server process starts (the app
// bundle itself is loaded lazily on the first request). Fails fast on bad
// configuration and applies pending DB migrations before any request is served.
// On a fresh instance it also prints the first-admin invite link.
// Uses relative imports: Nitro bundles this file outside Vite's `~` alias.
import { definePlugin } from "nitro";
import { bootstrapInviteAtStartup } from "../server/auth/invites";
import { openDatabase } from "../server/db/client";
import { getEnv } from "../server/env";
import { seedStarterTemplates } from "../server/item-types/seed";

export default definePlugin(() => {
  try {
    const env = getEnv();
    const db = openDatabase(env.DATABASE_PATH, { snapshotBeforeMigrate: true });
    // Starter item types, once per instance (DESIGN §4.4); see item-types/seed.ts.
    seedStarterTemplates(db);
    // First admin (README "Erster Start"): while there are no users at all,
    // print a fresh one-time admin invite link. Nothing is printed afterwards.
    const link = bootstrapInviteAtStartup(db, env.ORIGIN);
    db.$client.close();
    if (link) {
      console.log(
        `[bootstrap] No users yet. Create the first admin (link valid 24 h, usable once):\n[bootstrap] ${link}`,
      );
    }
  } catch (err) {
    console.error("[startup] fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
});
