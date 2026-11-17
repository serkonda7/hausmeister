// Graceful shutdown (production): SIGTERM/SIGINT → stop accepting requests,
// let in-flight ones finish, stop the job worker, checkpoint and close SQLite,
// exit 0. `docker stop` (and every `docker compose up -d` upgrade) sends
// SIGTERM and kills after 10 s, so all bounds together stay well below that.
//
// Order: srvx (Nitro's HTTP server) traps the signals itself, closes the port
// and waits up to SERVER_SHUTDOWN_TIMEOUT seconds (default 5) for open
// requests, then force-closes them (open exports end as ExportAborted). Its
// close triggers Nitro's "close" hook, where `runShutdown` does the rest.
// srvx skips trapping signals when CI or TEST is set; then our own listener
// does the cleanup directly. A deadline makes sure the process never hangs.
// Relative imports: loaded by the Nitro startup plugin.
import { closeDb } from "./db/client";
import { stopJobWorker } from "./jobs/worker";

export type ShutdownDeps = {
  stopWorker: (o: { timeoutMs: number }) => Promise<boolean>;
  closeDb: () => unknown;
  log: (msg: string) => void;
  /** How long a running job may take to finish (default 3 s). */
  jobTimeoutMs?: number;
};

/** Stops the worker (bounded), then closes the database. Never throws. */
export async function runShutdown(d: ShutdownDeps): Promise<{ ok: boolean }> {
  let ok = true;
  try {
    const finished = await d.stopWorker({ timeoutMs: d.jobTimeoutMs ?? 3_000 });
    if (!finished) {
      ok = false;
      d.log("[shutdown] a job was still running; it will run again at the next start");
    }
  } catch (err) {
    ok = false;
    d.log(`[shutdown] stopping the job worker failed: ${String(err)}`);
  }
  try {
    d.closeDb();
  } catch (err) {
    ok = false;
    d.log(`[shutdown] closing the database failed: ${String(err)}`);
  }
  return { ok };
}

type Hooks = { hook: (name: "close", fn: () => unknown) => unknown };

/**
 * Wires shutdown into the Nitro app. Exits the process once cleanup is done
 * (0, or 1 if something failed or the deadline hit).
 */
export function installGracefulShutdown(
  hooks: Hooks,
  o: { deadlineMs?: number; exit?: (code: number) => void } = {},
) {
  const exit = o.exit ?? ((code: number) => process.exit(code));
  const deadlineMs = o.deadlineMs ?? 9_000;
  let signalled = false;
  let started: Promise<void> | undefined;

  const finish = () => {
    started ??= runShutdown({ stopWorker: stopJobWorker, closeDb, log: console.log }).then(
      ({ ok }) => {
        console.log(`[shutdown] done${ok ? "" : " with errors"}`);
        // Only a signal ends the process; a close without one (dev reloads) does not.
        if (signalled) exit(ok ? 0 : 1);
      },
    );
    return started;
  };

  hooks.hook("close", finish);

  const onSignal = (sig: NodeJS.Signals) => {
    if (signalled) return;
    signalled = true;
    console.log(`[shutdown] ${sig} received`);
    setTimeout(() => {
      console.error("[shutdown] deadline reached, exiting");
      exit(1);
    }, deadlineMs).unref();
    // srvx handles the signal too (closes the server → "close" hook). Without
    // its listener (CI/TEST set) nothing else would, so clean up right away.
    if (process.listenerCount(sig) <= 1) void finish();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}
