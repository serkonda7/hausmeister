// In-process job worker (DESIGN §7 "Jobs"): one loop per process that leases
// due rows from `jobs` and runs the registered handler, one job at a time.
//
//   registerJobHandler("reminders.daily", async (payload, { db }) => { … },
//     { maxAttempts: 3, recurring: { next: (now) => nextEightOClock(now) } });
//   enqueueJob(db, "reminders.daily", { … });       // from ./queue
//
// Failures retry with exponential backoff; after maxAttempts the row is "dead"
// (done_at + last_error). While a handler runs, its lease is renewed; a handler
// that exceeds timeoutMs is treated as failed. On start the worker releases
// leases left by a crashed process (single instance), so interrupted jobs run
// again right away; the interrupted attempt still counts.
//
// The registry and the process worker live on globalThis: the Nitro startup
// plugin and the lazily loaded app bundle may each carry their own copy of
// this module, and both must reach the same worker.
import { type AppDb, getDb } from "../db/client";
import type { Job } from "../db/schema";
import {
  backoffMs,
  claimNextJob,
  completeJob,
  enqueueJob,
  failJob,
  hasPendingJob,
  heartbeat,
  pruneJobs,
  releaseStaleLeases,
} from "./queue";

export type JobContext = { db: AppDb; job: Job; signal: AbortSignal };
export type JobHandler = (payload: unknown, ctx: JobContext) => unknown | Promise<unknown>;

export type JobHandlerOptions = {
  /** Total runs before the job is given up (default 5). */
  maxAttempts?: number;
  /** First retry delay (default 30 s), doubled per attempt up to backoffMaxMs (default 1 h). */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** A run taking longer counts as failed (default 5 min). */
  timeoutMs?: number;
  /** Keeps exactly one pending row of this kind, scheduled at next(now). */
  recurring?: { next: (now: Date) => Date };
};

type Entry = {
  run: JobHandler;
  opts: Required<Omit<JobHandlerOptions, "recurring">> & JobHandlerOptions;
};
export type JobRegistry = Map<string, Entry>;

export function createJobRegistry(): JobRegistry {
  return new Map();
}

export function addJobHandler(
  registry: JobRegistry,
  kind: string,
  run: JobHandler,
  opts: JobHandlerOptions = {},
) {
  registry.set(kind, {
    run,
    opts: {
      maxAttempts: 5,
      backoffBaseMs: 30_000,
      backoffMaxMs: 3_600_000,
      timeoutMs: 300_000,
      ...opts,
    },
  });
}

type Globals = { registry: JobRegistry; worker?: JobWorker };
const G = globalThis as unknown as { __hausmeisterJobs?: Globals };
const globals = (): Globals => {
  G.__hausmeisterJobs ??= { registry: createJobRegistry() };
  return G.__hausmeisterJobs;
};

/** The process-wide registry the startup worker runs. */
export const jobRegistry = (): JobRegistry => globals().registry;

/** Registers a handler with the process-wide registry (from src/server/jobs/handlers.ts). */
export function registerJobHandler(kind: string, run: JobHandler, opts?: JobHandlerOptions) {
  addJobHandler(globals().registry, kind, run, opts);
}

export type JobWorker = ReturnType<typeof createJobWorker>;

export function createJobWorker(o: {
  db: AppDb;
  registry: JobRegistry;
  lockMs?: number;
  pollMs?: number;
  now?: () => number;
  log?: (msg: string, err?: unknown) => void;
}) {
  const { db, registry } = o;
  const lockMs = o.lockMs ?? 60_000;
  const pollMs = o.pollMs ?? 2_000;
  const now = o.now ?? Date.now;
  const log = o.log ?? ((msg, err) => console.error(`[jobs] ${msg}`, err ?? ""));

  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: Promise<boolean> | undefined;
  let currentAbort: AbortController | undefined;
  let lastPrune = 0;

  function scheduleRecurring(kind: string, entry: Entry) {
    if (!entry.opts.recurring || hasPendingJob(db, kind)) return;
    enqueueJob(db, kind, {}, { runAt: entry.opts.recurring.next(new Date(now())) });
  }

  async function execute(job: Job, entry: Entry): Promise<void> {
    const ac = new AbortController();
    currentAbort = ac;
    const beat = setInterval(
      () => {
        if (!heartbeat(db, job, now() + lockMs)) ac.abort(new Error("lease lost"));
      },
      Math.max(10, Math.floor(lockMs / 3)),
    );
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => entry.run(job.payload, { db, job, signal: ac.signal })),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            ac.abort(new Error("timeout"));
            reject(new Error(`timed out after ${entry.opts.timeoutMs} ms`));
          }, entry.opts.timeoutMs);
        }),
      ]);
    } finally {
      currentAbort = undefined;
      clearInterval(beat);
      clearTimeout(timeout);
    }
  }

  /** Leases and runs one due job. True when a job was claimed. */
  async function runOnce(): Promise<boolean> {
    const job = claimNextJob(db, { now: now(), lockMs, kinds: [...registry.keys()] });
    if (!job) return false;
    const entry = registry.get(job.kind)!;
    if (job.attempts > entry.opts.maxAttempts) {
      // Only reachable when earlier attempts died with the process.
      failJob(db, job, "interrupted too often", now(), null);
      scheduleRecurring(job.kind, entry);
      return true;
    }
    try {
      await execute(job, entry);
      completeJob(db, job, now());
    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
      const retryAt =
        job.attempts >= entry.opts.maxAttempts
          ? null
          : now() + backoffMs(job.attempts, entry.opts.backoffBaseMs, entry.opts.backoffMaxMs);
      failJob(db, job, msg, now(), retryAt);
      log(
        `${job.kind} ${job.id} failed (attempt ${job.attempts})${retryAt ? "" : ", giving up"}`,
        err,
      );
    }
    scheduleRecurring(job.kind, entry);
    return true;
  }

  async function loop() {
    timer = undefined;
    if (!running) return;
    let didWork = false;
    try {
      current = runOnce();
      didWork = await current;
      if (now() - lastPrune > 86_400_000) {
        lastPrune = now();
        pruneJobs(db, new Date(now() - 7 * 86_400_000));
      }
    } catch (err) {
      log("worker loop error", err);
    } finally {
      current = undefined;
    }
    if (running) timer = setTimeout(loop, didWork ? 0 : pollMs);
  }

  return {
    runOnce,
    /** Runs due jobs until none is left (tests). */
    async drain(max = 1000) {
      let n = 0;
      while (n < max && (await runOnce())) n++;
      return n;
    },
    start() {
      if (running) return;
      running = true;
      const released = releaseStaleLeases(db);
      if (released) log(`released ${released} lease(s) from a previous run`);
      for (const [kind, entry] of registry) scheduleRecurring(kind, entry);
      timer = setTimeout(loop, 0);
    },
    /** Wakes the loop now instead of at the next poll. */
    kick() {
      if (running && timer && !current) {
        clearTimeout(timer);
        timer = setTimeout(loop, 0);
      }
    },
    /**
     * Stops polling and waits for the running job. With `timeoutMs`, a job that
     * is still running then gets its signal aborted and is left behind: its
     * lease is released at the next start, so it runs again (handlers are
     * idempotent). Resolves true when no job was left running.
     */
    async stop(opts: { timeoutMs?: number } = {}): Promise<boolean> {
      running = false;
      if (timer) clearTimeout(timer);
      timer = undefined;
      const pending = current?.catch(() => false);
      if (!pending) return true;
      if (opts.timeoutMs === undefined) {
        await pending;
        return true;
      }
      let t: ReturnType<typeof setTimeout> | undefined;
      const finished = await Promise.race([
        pending.then(() => true),
        new Promise<false>((r) => {
          t = setTimeout(() => r(false), opts.timeoutMs);
        }),
      ]);
      clearTimeout(t);
      if (!finished) currentAbort?.abort(new Error("shutdown"));
      return finished;
    },
    get running() {
      return running;
    },
  };
}

/** Starts the process worker with the global registry (startup plugin; default db: getDb()). */
export function startJobWorker(db: AppDb = getDb()): JobWorker {
  const g = globals();
  g.worker ??= createJobWorker({ db, registry: g.registry });
  g.worker.start();
  return g.worker;
}

/** Nudges the process worker after enqueueing (no-op when none runs, e.g. in tests). */
export function kickJobWorker() {
  globals().worker?.kick();
}

/** Stops the process worker at shutdown (see ../shutdown.ts). True when no job was left running. */
export async function stopJobWorker(opts: { timeoutMs?: number } = {}): Promise<boolean> {
  return (await globals().worker?.stop(opts)) ?? true;
}
