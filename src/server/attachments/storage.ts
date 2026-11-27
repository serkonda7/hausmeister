// Content-addressed blob store under UPLOAD_DIR (DESIGN §6 notes):
//   <root>/ab/cd/<sha256>               stored file (sanitized image or PDF as uploaded)
//   <root>/thumbs/ab/cd/<sha256>.webp   WebP thumbnail of an image blob (derived, rebuildable)
//   <root>/tmp/                         in-flight writes, renamed into place
// Writes are atomic (temp file, fsync, rename), so a reader never sees half a
// file and a crash leaves at most a stale temp file (removed by the sweep).
// Deleting blobs is the job of gc.ts, which checks references first.
import { createHash } from 'node:crypto'
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	renameSync,
	rmSync,
	writeSync,
} from 'node:fs'
import { mkdir, open, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { getEnv } from '../env'

const SHA_RE = /^[0-9a-f]{64}$/

export const isSha256 = (s: string) => SHA_RE.test(s)

export function sha256Hex(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex')
}

export type BlobStore = ReturnType<typeof createBlobStore>

export function createBlobStore(rootDir: string) {
	const root = resolve(rootDir)
	const tmpDir = join(root, 'tmp')

	function check(sha: string) {
		if (!isSha256(sha)) throw new Error(`invalid sha256: ${sha}`)
	}
	const blobPath = (sha: string) => {
		check(sha)
		return join(root, sha.slice(0, 2), sha.slice(2, 4), sha)
	}
	const thumbPath = (sha: string) => {
		check(sha)
		return join(root, 'thumbs', sha.slice(0, 2), sha.slice(2, 4), `${sha}.webp`)
	}
	const tmpPath = () => join(tmpDir, `${Bun.randomUUIDv7()}.tmp`)

	/** Async atomic write: temp file in the same file system, fsync, rename. */
	async function writeAtomic(target: string, bytes: Uint8Array) {
		await mkdir(tmpDir, { recursive: true })
		await mkdir(dirname(target), { recursive: true })
		const tmp = tmpPath()
		const fh = await open(tmp, 'wx', 0o640)
		try {
			await fh.writeFile(bytes)
			await fh.sync()
		} finally {
			await fh.close()
		}
		try {
			await rename(tmp, target)
		} catch (err) {
			await rm(tmp, { force: true })
			throw err
		}
	}

	/** Synchronous variant, for the one step that must not yield (see ensureBlobSync). */
	function writeAtomicSync(target: string, bytes: Uint8Array) {
		mkdirSync(tmpDir, { recursive: true })
		mkdirSync(dirname(target), { recursive: true })
		const tmp = tmpPath()
		const fd = openSync(tmp, 'wx', 0o640)
		try {
			writeSync(fd, bytes)
			fsyncSync(fd)
		} finally {
			closeSync(fd)
		}
		renameSync(tmp, target)
	}

	return {
		root,
		tmpDir,
		blobPath,
		thumbPath,

		/** Stores bytes under their sha256 (no-op when that blob already exists: dedup). */
		async put(bytes: Uint8Array): Promise<{ sha256: string; created: boolean }> {
			const sha256 = sha256Hex(bytes)
			const target = blobPath(sha256)
			if (existsSync(target)) return { sha256, created: false }
			await writeAtomic(target, bytes)
			return { sha256, created: true }
		},

		/**
		 * Makes sure the blob exists, synchronously. Called in the same tick as the
		 * attachments insert, so a concurrent gc (which checks references and
		 * unlinks synchronously too) can never delete a blob a new row points at.
		 */
		ensureBlobSync(sha256: string, bytes: Uint8Array) {
			const target = blobPath(sha256)
			if (!existsSync(target)) writeAtomicSync(target, bytes)
		},

		hasBlob: (sha256: string) => existsSync(blobPath(sha256)),
		hasThumb: (sha256: string) => existsSync(thumbPath(sha256)),

		async putThumb(sha256: string, bytes: Uint8Array) {
			await writeAtomic(thumbPath(sha256), bytes)
		},

		/** Removes a blob and its thumbnail. Callers check references first (gc.ts). */
		removeSync(sha256: string) {
			rmSync(blobPath(sha256), { force: true })
			rmSync(thumbPath(sha256), { force: true })
		},
	}
}

let instance: BlobStore | undefined

/** The process-wide store on UPLOAD_DIR. Tests use createBlobStore(tempDir). */
export function getBlobStore(): BlobStore {
	instance ??= createBlobStore(getEnv().UPLOAD_DIR)
	return instance
}
