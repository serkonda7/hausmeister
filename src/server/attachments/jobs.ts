// Job handlers of the attachments feature (registered by src/server/jobs/handlers.ts).
import { z } from 'zod'
import { addJobHandler, type JobRegistry } from '../jobs/worker'
import { collectBlobIfUnreferenced, GC_JOB, SWEEP_JOB, sweepOrphanBlobs, THUMB_JOB } from './gc'
import type { BlobStore } from './storage'
import { ensureThumbnail } from './thumbs'

const shaPayload = z.object({ sha256: z.string().regex(/^[0-9a-f]{64}$/) })

/** Next 03:30 server time after `now`. */
export function nextNightly(now: Date): Date {
	const d = new Date(now)
	d.setHours(3, 30, 0, 0)
	if (d <= now) d.setDate(d.getDate() + 1)
	return d
}

export function addAttachmentJobs(registry: JobRegistry, store: () => BlobStore) {
	addJobHandler(
		registry,
		THUMB_JOB,
		async (payload, { db }) => {
			const { sha256 } = shaPayload.parse(payload)
			const s = store()
			// Deleted again before the job ran: nothing to do.
			if (!s.hasBlob(sha256) || collectBlobIfUnreferenced(db, s, sha256)) return
			await ensureThumbnail(s, sha256)
		},
		{ maxAttempts: 3, backoffBaseMs: 10_000 },
	)
	addJobHandler(registry, GC_JOB, (payload, { db }) => {
		collectBlobIfUnreferenced(db, store(), shaPayload.parse(payload).sha256)
	})
	addJobHandler(
		registry,
		SWEEP_JOB,
		(_payload, { db }) => {
			const r = sweepOrphanBlobs(db, store())
			if (r.blobs || r.thumbs || r.tmp) console.log('[attachments] sweep removed', r)
		},
		{ recurring: { next: nextNightly } },
	)
}
