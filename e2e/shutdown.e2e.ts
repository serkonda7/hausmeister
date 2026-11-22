// Graceful shutdown. Starts a second copy of the e2e production build
// (own port and data dir), writes to it, sends SIGTERM/SIGINT and measures the
// exit: code 0, quickly (docker stop kills after 10 s), SQLite closed cleanly
// (no -wal/-shm left) and the data intact.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { E2E_BUILD_DIR } from "./env";
import { expect, test } from "./fixtures";

for (const [signal, port] of [
  ["SIGTERM", 3295],
  ["SIGINT", 3296],
] as const) {
  test(`${signal}: the built server exits 0 within a few seconds and closes SQLite`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "hm-shutdown-"));
    const db = join(dir, "app.sqlite");
    let log = "";
    const child = spawn("bun", ["run", `${E2E_BUILD_DIR}/server/index.mjs`], {
      env: {
        ...process.env,
        CI: "", // srvx only traps signals without CI/TEST; the app copes either way
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdefghijklmnopqrstuv",
        ORIGIN: `http://localhost:${port}`,
        PORT: String(port),
        HOST: "127.0.0.1",
        DATABASE_PATH: db,
        UPLOAD_DIR: join(dir, "uploads"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (c: Buffer) => (log += c));
    child.stderr.on("data", (c: Buffer) => (log += c));
    const exited = new Promise<number | null>((r) => child.on("exit", (code) => r(code)));
    try {
      await expect
        .poll(async () => (await fetch(`http://127.0.0.1:${port}/health`).catch(() => null))?.ok)
        .toBe(true);
      // A few requests so the app bundle and its connection are in use.
      for (let i = 0; i < 3; i++) await fetch(`http://127.0.0.1:${port}/health`);
      expect(existsSync(`${db}-wal`)).toBe(true);

      const t0 = Date.now();
      child.kill(signal);
      const code = await exited;
      const ms = Date.now() - t0;
      expect(code, log).toBe(0);
      expect(ms, log).toBeLessThan(3000);
      expect(log).toContain("[shutdown] done");
      expect(existsSync(`${db}-wal`)).toBe(false);
      expect(existsSync(`${db}-shm`)).toBe(false);
      // Playwright runs in Node, so ask bun to read the file.
      const check = execFileSync(
        "bun",
        [
          "-e",
          `const d = new (require("bun:sqlite").Database)(process.argv[1], { readonly: true });
           console.log(JSON.stringify([d.query("PRAGMA integrity_check").get(), d.query("SELECT count(*) AS n FROM boots").get()]));`,
          db,
        ],
        { encoding: "utf8" },
      );
      expect(JSON.parse(check)).toEqual([{ integrity_check: "ok" }, { n: 1 }]);
    } finally {
      child.kill("SIGKILL");
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
