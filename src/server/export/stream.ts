// A pull-driven byte stream for the response body. The producer awaits
// write(); write() returns only while the consumer keeps up, so at most
// `highWaterMark` chunks sit in the queue (bounded memory, whatever the size of
// the archive). A cancelled stream (client gone) or a consumer that stops
// reading for `idleTimeoutMs` makes the next write() throw ExportAborted, so the
// producer unwinds through its finally blocks (snapshot closed, lock released).

export class ExportAborted extends Error {
	constructor(public readonly reason: 'client' | 'idle') {
		super(`export aborted (${reason})`)
		this.name = 'ExportAborted'
	}
}

export type ByteWriter = (chunk: Uint8Array) => Promise<void>

export function createProducerStream(
	produce: (write: ByteWriter, signal: AbortSignal) => Promise<void>,
	opts: { highWaterMark?: number; idleTimeoutMs?: number; signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
	const idleMs = opts.idleTimeoutMs ?? 10 * 60_000
	const abort = new AbortController()
	let controller!: ReadableStreamDefaultController<Uint8Array>
	let wake: (() => void) | null = null
	let aborted: ExportAborted | null = null

	const stop = (reason: 'client' | 'idle') => {
		aborted ??= new ExportAborted(reason)
		if (!abort.signal.aborted) abort.abort(aborted)
		wake?.()
	}
	opts.signal?.addEventListener('abort', () => stop('client'), { once: true })

	const waitForPull = () =>
		new Promise<void>((resolve) => {
			const timer = setTimeout(() => stop('idle'), idleMs)
			wake = () => {
				clearTimeout(timer)
				wake = null
				resolve()
			}
		})

	const write: ByteWriter = async (chunk) => {
		if (aborted) throw aborted
		controller.enqueue(chunk)
		while (!aborted && (controller.desiredSize ?? 1) <= 0) await waitForPull()
		if (aborted) throw aborted
	}

	return new ReadableStream<Uint8Array>(
		{
			start(c) {
				controller = c
				// Not awaited: start() must return so the consumer can begin reading.
				produce(write, abort.signal).then(
					() => {
						if (!aborted) controller.close()
					},
					(err) => {
						// A cancelled stream has no reader left; an idle one gets an error.
						if (aborted?.reason === 'client') return
						try {
							controller.error(aborted ?? err)
						} catch {
							// already closed
						}
					},
				)
			},
			pull() {
				wake?.()
			},
			cancel() {
				stop('client')
			},
		},
		{ highWaterMark: opts.highWaterMark ?? 4 },
	)
}
