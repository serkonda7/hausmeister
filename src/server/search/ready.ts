// The database for item server functions: the process-wide getDb(), with a
// one-time search index check on first use. The Nitro startup plugin cannot
// import the indexer (it needs Vite's `~` alias via the item-type display
// helpers), so the check runs when the app bundle first touches items: if
// items_fts is empty or out of step with `items` (e.g. after a restore or a
// manual DB edit), it is rebuilt before the first query.
// The one-time starter-type upgrade (item-types/upgrade.ts) runs just before, for the same reason.
import { type AppDb, getDb } from "../db/client";
import { upgradeStarterTypes } from "../item-types/upgrade";
import { ensureSearchIndex } from "./indexer";

let checked = false;

export function itemsDb(): AppDb {
  const db = getDb();
  if (!checked) {
    checked = true;
    const up = upgradeStarterTypes(db);
    if (up && (up.warranty || up.fitsItems))
      console.log("[item-types] starter types upgraded for v1.2", up);
    if (ensureSearchIndex(db)) console.log("[search] index was out of step; rebuilt");
  }
  return db;
}
