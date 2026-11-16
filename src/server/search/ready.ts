// The database for item server functions: the process-wide getDb(), with a
// one-time search index check on first use. The Nitro startup plugin cannot
// import the indexer (it needs Vite's `~` alias via the item-type display
// helpers), so the check runs when the app bundle first touches items: if
// items_fts is empty or out of step with `items` (e.g. after a restore or a
// manual DB edit), it is rebuilt before the first query.
import { type AppDb, getDb } from "../db/client";
import { ensureSearchIndex } from "./indexer";

let checked = false;

export function itemsDb(): AppDb {
  const db = getDb();
  if (!checked) {
    checked = true;
    if (ensureSearchIndex(db)) console.log("[search] index was out of step; rebuilt");
  }
  return db;
}
