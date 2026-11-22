// Removing blobs no attachment row references any more. Blobs are shared
// (dedup), so a file is only deleted after checking that no row uses its hash.
// Safety argument: the reference check and the unlink happen synchronously in
// one tick, and an upload re-creates its blob synchronously in the same tick
// as its insert (BlobStore.ensureBlobSync). bun:sqlite and fs *Sync calls never
// yield, so neither can interleave with the other.
//
// Two paths: deleting an attachment enqueues "attachments.gc" for its hash;
// rows removed by an item delete (ON DELETE CASCADE) are found by the daily
// "attachments.sweep", which walks UPLOAD_DIR.
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client";
import { attachments } from "../db/schema";
import { enqueueJob } from "../jobs/queue";
import { type BlobStore, isSha256 } from "./storage";

export const GC_JOB = "attachments.gc";
export const SWEEP_JOB = "attachments.sweep";
export const THUMB_JOB = "attachments.thumbnail";

export function isBlobReferenced(db: DbOrTx, sha256: string): boolean {
  return !!db
    .select({ id: attachments.id })
    .from(attachments)
    .where(eq(attachments.sha256, sha256))
    .limit(1)
    .get();
}

/** Deletes the blob (and its thumbnail) when no row references it. True when deleted. */
export function collectBlobIfUnreferenced(db: DbOrTx, store: BlobStore, sha256: string): boolean {
  if (isBlobReferenced(db, sha256)) return false;
  store.removeSync(sha256);
  return true;
}

/**
 * Queues a reference check for each hash. Call it in the transaction that
 * deletes attachment rows (or items: select their hashes before the delete).
 */
export function enqueueBlobGc(db: DbOrTx, sha256s: Iterable<string>) {
  for (const sha256 of new Set(sha256s)) enqueueJob(db, GC_JOB, { sha256 });
}

function listFiles(dir: string, depth: number): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  if (depth === 0) return names.map((n) => join(dir, n));
  return names
    .filter((n) => /^[0-9a-f]{2}$/.test(n))
    .flatMap((n) => listFiles(join(dir, n), depth - 1));
}

function olderThan(path: string, cutoff: number): boolean {
  try {
    return statSync(path).mtimeMs < cutoff;
  } catch {
    return false;
  }
}

/**
 * Removes unreferenced blobs and thumbnails, plus temp files of crashed writes.
 * Only files older than `graceMs` are considered (a fresh blob may belong to an
 * upload that has not inserted its row yet; ensureBlobSync would restore it,
 * the grace just avoids the extra write). Runs entirely synchronously.
 */
export function sweepOrphanBlobs(
  db: DbOrTx,
  store: BlobStore,
  opts: { graceMs?: number; now?: number } = {},
): { blobs: number; thumbs: number; tmp: number } {
  const cutoff = (opts.now ?? Date.now()) - (opts.graceMs ?? 3_600_000);
  const referenced = new Set(
    db
      .selectDistinct({ sha256: attachments.sha256 })
      .from(attachments)
      .all()
      .map((r) => r.sha256),
  );
  const out = { blobs: 0, thumbs: 0, tmp: 0 };
  for (const path of listFiles(store.root, 2)) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (isSha256(name) && !referenced.has(name) && olderThan(path, cutoff)) {
      rmSync(path, { force: true });
      out.blobs++;
    }
  }
  for (const path of listFiles(join(store.root, "thumbs"), 2)) {
    const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.webp$/, "");
    if (isSha256(name) && !referenced.has(name) && olderThan(path, cutoff)) {
      rmSync(path, { force: true });
      out.thumbs++;
    }
  }
  for (const path of listFiles(store.tmpDir, 0)) {
    if (olderThan(path, cutoff)) {
      rmSync(path, { force: true });
      out.tmp++;
    }
  }
  return out;
}
