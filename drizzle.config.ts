import { defineConfig } from "drizzle-kit";

// Only used by `bun run db:generate`; the app applies ./drizzle at startup.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
