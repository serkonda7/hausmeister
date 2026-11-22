// Shared by playwright.config.ts, the server wrapper and the fixtures.
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const E2E_PORT = Number(process.env.E2E_PORT ?? 3211);
// localhost (not 127.0.0.1): WebAuthn needs it as RP ID over plain http.
export const E2E_ORIGIN = `http://localhost:${E2E_PORT}`;
/** Throwaway data dir (DB + uploads), wiped at every server start. */
export const E2E_DIR = process.env.E2E_DIR ?? join(tmpdir(), `hausmeister-e2e-${E2E_PORT}`);
export const E2E_DB = join(E2E_DIR, "app.sqlite");
/** The server wrapper writes the startup bootstrap link here. */
export const BOOTSTRAP_LINK_FILE = join(E2E_DIR, "bootstrap-link.txt");
/** Signed-in storage state of the first admin (written by bootstrap.setup.ts). */
export const ADMIN_STATE = join(E2E_DIR, "admin-state.json");
export const ADMIN = { username: "admin", password: "admin-password-1", displayName: "Admin" };
/** Production build used by e2e (inside the repo so bundling resolves; gitignored). */
export const E2E_BUILD_DIR = resolve(
  import.meta.dirname,
  "../node_modules/.cache/hausmeister-e2e/output",
);
