// Running exports, in memory. Limits: one per user, `maxGlobal` overall (each
// holds a snapshot, a file handle and deflate CPU on a 1-vCPU VPS).
// The export page reserves a slot first (so "busy" is a German error, not a
// failed download), then GET /api/v1/export?ticket=… claims it within
// `ticketTtlMs`. API clients call without a ticket and acquire a slot directly.
// The producer's finally block releases the slot (done, disconnect, idle,
// error). Also keeps the running export's progress and each user's last result.
import type { ExportProgress } from '../../lib/export/types'

export type ExportSlot = {
	readonly userId: string
	readonly ticket: string
	progress: ExportProgress
	release(result: { completed: boolean; bytes: number }): void
}

export type SlotError = 'EXPORT_BUSY' | 'EXPORT_LIMIT'

type Entry = { slot: ExportSlot; claimed: boolean; timer?: ReturnType<typeof setTimeout> }

export type ExportRegistry = ReturnType<typeof createExportRegistry>

export function createExportRegistry(opts: { maxGlobal: number; ticketTtlMs?: number }) {
	const ttl = opts.ticketTtlMs ?? 60_000
	const active = new Map<string, Entry>()
	const last = new Map<string, { finishedAt: Date; completed: boolean; bytes: number }>()

	function make(userId: string): Entry | SlotError {
		if (active.has(userId)) return 'EXPORT_BUSY'
		if (active.size >= opts.maxGlobal) return 'EXPORT_LIMIT'
		let done = false
		const entry: Entry = {
			claimed: false,
			slot: {
				userId,
				ticket: Bun.randomUUIDv7(),
				progress: {
					startedAt: new Date(),
					phase: 'data',
					bytesWritten: 0,
					filesDone: 0,
					filesTotal: 0,
				},
				release(result) {
					if (done) return
					done = true
					clearTimeout(entry.timer)
					if (active.get(userId) === entry) active.delete(userId)
					last.set(userId, { finishedAt: new Date(), ...result })
				},
			},
		}
		active.set(userId, entry)
		return entry
	}

	return {
		/** A running slot for an API call (no reservation). */
		acquire(userId: string): ExportSlot | SlotError {
			const e = make(userId)
			if (typeof e === 'string') return e
			e.claimed = true
			return e.slot
		},
		/** Reserves a slot for a download that starts within the ticket lifetime. */
		reserve(userId: string): { ticket: string } | SlotError {
			const e = make(userId)
			if (typeof e === 'string') return e
			e.timer = setTimeout(() => {
				if (!e.claimed && active.get(userId) === e) active.delete(userId)
			}, ttl)
			return { ticket: e.slot.ticket }
		},
		/** The reserved slot for this ticket, or null (unknown, expired, used, other user). */
		claim(userId: string, ticket: string): ExportSlot | null {
			const e = active.get(userId)
			if (!e || e.claimed || e.slot.ticket !== ticket) return null
			clearTimeout(e.timer)
			e.claimed = true
			e.slot.progress.startedAt = new Date()
			return e.slot
		},
		status(userId: string) {
			const e = active.get(userId)
			return { active: e?.slot.progress ?? null, last: last.get(userId) ?? null }
		},
		get activeCount() {
			return active.size
		},
	}
}

let instance: ExportRegistry | undefined

/** The process-wide registry: two exports at once, one per user. */
export function getExportRegistry(): ExportRegistry {
	instance ??= createExportRegistry({ maxGlobal: 2 })
	return instance
}
