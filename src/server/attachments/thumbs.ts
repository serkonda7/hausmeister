// Thumbnails are derived data: keyed by the blob's sha256, built by the
// "attachments.thumbnail" job right after upload, and built on demand by the
// file route if a request comes first, so a thumbnail URL never fails while
// the job is still queued.
import { makeThumbnail } from "./process";
import type { BlobStore } from "./storage";

const inFlight = new Map<string, Promise<string>>();

/** Path of the blob's WebP thumbnail, generating it first when missing. */
export function ensureThumbnail(store: BlobStore, sha256: string): Promise<string> {
  const path = store.thumbPath(sha256);
  if (store.hasThumb(sha256)) return Promise.resolve(path);
  const key = `${store.root}:${sha256}`;
  let p = inFlight.get(key);
  if (!p) {
    p = (async () => {
      const original = await Bun.file(store.blobPath(sha256)).bytes();
      await store.putThumb(sha256, await makeThumbnail(original));
      return path;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
  }
  return p;
}
