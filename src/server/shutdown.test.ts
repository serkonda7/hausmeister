// The real built server's SIGTERM/SIGINT exit is tested in e2e/shutdown.e2e.ts.
import { describe, expect, test } from "bun:test";
import { runShutdown } from "./shutdown";

describe("runShutdown", () => {
  test("stops the worker, then closes the database", async () => {
    const calls: string[] = [];
    const r = await runShutdown({
      stopWorker: async (o) => {
        calls.push(`stop:${o.timeoutMs}`);
        return true;
      },
      closeDb: () => calls.push("close"),
      log: (m) => calls.push(m),
      jobTimeoutMs: 1234,
    });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["stop:1234", "close"]);
  });

  test("still closes the database when the worker fails or a job overruns", async () => {
    const calls: string[] = [];
    const r = await runShutdown({
      stopWorker: async () => {
        throw new Error("boom");
      },
      closeDb: () => calls.push("close"),
      log: () => {},
    });
    expect(r.ok).toBe(false);
    expect(calls).toEqual(["close"]);
    const r2 = await runShutdown({
      stopWorker: async () => false,
      closeDb: () => {},
      log: () => {},
    });
    expect(r2.ok).toBe(false);
  });
});
