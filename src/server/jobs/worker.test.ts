import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { AppDb } from "../db/client";
import { jobs } from "../db/schema";
import { createTestDb } from "../db/test-db";
import {
  backoffMs,
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  releaseStaleLeases,
} from "./queue";
import { addJobHandler, createJobRegistry, createJobWorker, type JobRegistry } from "./worker";

let db: AppDb;
let registry: JobRegistry;
let clock: number;
// Fake clock starting at the real time: enqueueJob() defaults run_at to Date.now().
let T0 = 0;
const now = () => clock;
const row = (id: string) => db.select().from(jobs).where(eq(jobs.id, id)).get()!;

beforeEach(() => {
  db = createTestDb();
  registry = createJobRegistry();
  T0 = Date.now() + 1000;
  clock = T0;
});

const worker = (o: { lockMs?: number } = {}) =>
  createJobWorker({ db, registry, now, log: () => {}, lockMs: o.lockMs ?? 60_000 });

describe("queue", () => {
  test("claims due jobs in run_at order, only of known kinds, once", () => {
    const later = enqueueJob(db, "a", { n: 2 }, { runAt: new Date(T0 + 1000) });
    const first = enqueueJob(db, "a", { n: 1 }, { runAt: new Date(T0 - 1000) });
    enqueueJob(db, "unknown", {}, { runAt: new Date(T0 - 5000) });

    const j = claimNextJob(db, { now: T0, lockMs: 5000, kinds: ["a"] })!;
    expect(j.id).toBe(first);
    expect(j.payload).toEqual({ n: 1 });
    expect(j.attempts).toBe(1);
    expect(j.lockedUntil?.getTime()).toBe(T0 + 5000);
    // Leased: nobody else gets it; the other one is not due yet.
    expect(claimNextJob(db, { now: T0, lockMs: 1000, kinds: ["a"] })).toBeNull();
    expect(claimNextJob(db, { now: T0 + 1000, lockMs: 1000, kinds: ["a"] })?.id).toBe(later);
  });

  test("an expired lease can be re-claimed, and then the old holder cannot finish", () => {
    enqueueJob(db, "a");
    const first = claimNextJob(db, { now: T0, lockMs: 1000, kinds: ["a"] })!;
    const second = claimNextJob(db, { now: T0 + 1001, lockMs: 1000, kinds: ["a"] })!;
    expect(second.id).toBe(first.id);
    expect(second.attempts).toBe(2);
    expect(completeJob(db, first, T0 + 1002)).toBe(false);
    expect(failJob(db, first, "x", T0 + 1002, T0 + 5000)).toBe(false);
    expect(row(first.id).doneAt).toBeNull();
    expect(completeJob(db, second, T0 + 1003)).toBe(true);
    expect(row(first.id).doneAt?.getTime()).toBe(T0 + 1003);
  });

  test("backoff doubles and is capped", () => {
    expect([1, 2, 3, 4, 10].map((a) => backoffMs(a, 1000, 5000))).toEqual([
      1000, 2000, 4000, 5000, 5000,
    ]);
  });
});

describe("worker", () => {
  test("runs a handler and marks the job done", async () => {
    const seen: unknown[] = [];
    addJobHandler(registry, "a", (p) => {
      seen.push(p);
    });
    const id = enqueueJob(db, "a", { x: 1 });
    expect(await worker().drain()).toBe(1);
    expect(seen).toEqual([{ x: 1 }]);
    expect(row(id).doneAt).not.toBeNull();
    expect(row(id).lastError).toBeNull();
    expect(row(id).lockedUntil).toBeNull();
  });

  test("retries with exponential backoff, then gives up (dead)", async () => {
    let calls = 0;
    addJobHandler(
      registry,
      "flaky",
      () => {
        calls++;
        throw new Error(`boom ${calls}`);
      },
      { maxAttempts: 3, backoffBaseMs: 1000, backoffMaxMs: 60_000 },
    );
    const id = enqueueJob(db, "flaky");
    const w = worker();
    await w.runOnce();
    expect(row(id).runAt.getTime()).toBe(T0 + 1000);
    expect(row(id).lastError).toBe("boom 1");
    expect(await w.runOnce()).toBe(false); // not due yet
    clock = T0 + 1000;
    await w.runOnce();
    expect(row(id).runAt.getTime()).toBe(T0 + 1000 + 2000);
    clock = T0 + 3000;
    await w.runOnce();
    expect(calls).toBe(3);
    expect(row(id).doneAt?.getTime()).toBe(T0 + 3000);
    expect(row(id).lastError).toBe("boom 3");
    clock = T0 + 999_999;
    expect(await w.runOnce()).toBe(false);
  });

  test("a later success clears the error", async () => {
    let calls = 0;
    addJobHandler(
      registry,
      "once-fails",
      () => {
        if (++calls === 1) throw new Error("first");
      },
      { backoffBaseMs: 10 },
    );
    const id = enqueueJob(db, "once-fails");
    const w = worker();
    await w.runOnce();
    clock += 10;
    await w.runOnce();
    expect(row(id).doneAt).not.toBeNull();
    expect(row(id).lastError).toBeNull();
  });

  test("crash mid-job: the next process releases the lease and runs it again; the attempt counts", async () => {
    addJobHandler(registry, "a", () => {}, { maxAttempts: 2 });
    const id = enqueueJob(db, "a");
    // Process 1 claims and "dies" (no completion).
    claimNextJob(db, { now: T0, lockMs: 600_000, kinds: ["a"] });
    expect(row(id).lockedUntil).not.toBeNull();
    // Process 2 starts: released at once, without waiting 10 minutes.
    expect(releaseStaleLeases(db)).toBe(1);
    expect(await worker().drain()).toBe(1);
    expect(row(id).doneAt).not.toBeNull();
    expect(row(id).attempts).toBe(2);
  });

  test("a job that keeps killing the process ends up dead instead of looping forever", async () => {
    let ran = 0;
    addJobHandler(registry, "killer", () => void ran++, { maxAttempts: 2 });
    const id = enqueueJob(db, "killer");
    for (let i = 0; i < 2; i++) {
      claimNextJob(db, { now: clock, lockMs: 1000, kinds: ["killer"] });
      releaseStaleLeases(db);
    }
    await worker().drain();
    expect(ran).toBe(0);
    expect(row(id).doneAt).not.toBeNull();
    expect(row(id).lastError).toBe("interrupted too often");
  });

  test("no double execution: two workers, one slow job, lease kept alive by the heartbeat", async () => {
    clock = Date.now();
    const realNow = () => Date.now();
    let running = 0;
    let runs = 0;
    addJobHandler(registry, "slow", async () => {
      running++;
      runs++;
      expect(running).toBe(1);
      await Bun.sleep(150);
      running--;
    });
    const id = enqueueJob(db, "slow");
    const mk = () => createJobWorker({ db, registry, now: realNow, log: () => {}, lockMs: 60 });
    const w1 = mk();
    const w2 = mk();
    const p1 = w1.runOnce();
    await Bun.sleep(100); // past the original 60 ms lease: only the heartbeat keeps it
    expect(await w2.runOnce()).toBe(false);
    await p1;
    expect(await w2.runOnce()).toBe(false);
    expect(runs).toBe(1);
    expect(row(id).attempts).toBe(1);
    expect(row(id).doneAt).not.toBeNull();
  });

  test("a handler over its timeout counts as failed", async () => {
    addJobHandler(registry, "hang", () => new Promise(() => {}), {
      timeoutMs: 20,
      backoffBaseMs: 5,
    });
    const id = enqueueJob(db, "hang");
    await worker().runOnce();
    expect(row(id).lastError).toBe("timed out after 20 ms");
    expect(row(id).doneAt).toBeNull();
  });

  test("recurring handlers keep exactly one pending row", async () => {
    let runs = 0;
    addJobHandler(registry, "nightly", () => void runs++, {
      recurring: { next: (d) => new Date(d.getTime() + 86_400_000) },
    });
    const w = worker();
    w.start();
    await w.stop();
    w.start(); // a second start does not add another row
    await w.stop();
    const pending = () =>
      db
        .select()
        .from(jobs)
        .where(eq(jobs.kind, "nightly"))
        .all()
        .filter((j) => !j.doneAt);
    expect(pending()).toHaveLength(1);
    expect(pending()[0]!.runAt.getTime()).toBe(T0 + 86_400_000);
    clock = T0 + 86_400_000;
    await w.drain();
    expect(runs).toBe(1);
    expect(pending()).toHaveLength(1);
    expect(pending()[0]!.runAt.getTime()).toBe(T0 + 2 * 86_400_000);
  });

  test("start/kick/stop: the loop picks up new work", async () => {
    clock = Date.now();
    let runs = 0;
    addJobHandler(registry, "a", () => void runs++);
    const w = createJobWorker({ db, registry, log: () => {}, pollMs: 10_000 });
    w.start();
    await Bun.sleep(20);
    enqueueJob(db, "a");
    w.kick();
    for (let i = 0; i < 50 && runs === 0; i++) await Bun.sleep(5);
    await w.stop();
    expect(runs).toBe(1);
    expect(w.running).toBe(false);
  });
});

describe("worker stop (shutdown)", () => {
  test("waits for a running job, or aborts it after timeoutMs and leaves it to rerun", async () => {
    let release: () => void = () => {};
    let aborted: unknown;
    addJobHandler(registry, "slow", (_p, { signal }) => {
      signal.addEventListener("abort", () => {
        aborted = signal.reason;
        release();
      });
      return new Promise<void>((r) => {
        release = r;
      });
    });
    const id = enqueueJob(db, "slow", {}, { runAt: new Date(T0 - 1) });
    const w = createJobWorker({ db, registry, now: () => Date.now() + 2000, log: () => {} });
    w.start();
    await Bun.sleep(20); // the loop picks the job up
    expect(row(id).lockedUntil).not.toBeNull();
    const t0 = performance.now();
    expect(await w.stop({ timeoutMs: 50 })).toBe(false);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(String(aborted)).toContain("shutdown");
    expect(w.running).toBe(false);

    // A job that finishes in time: stop resolves true.
    const w2 = createJobWorker({ db, registry: createJobRegistry(), log: () => {} });
    w2.start();
    expect(await w2.stop({ timeoutMs: 50 })).toBe(true);
  });
});
