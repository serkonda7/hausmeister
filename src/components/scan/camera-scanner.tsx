// The camera part of scan mode (DESIGN §5.2): the browser's BarcodeDetector on a getUserMedia <video>, polled at about 8 frames per second.
// A hit vibrates and beeps.
// Browsers without BarcodeDetector (desktop Chrome on Windows/Linux, Firefox, Safari) get `supported() === "no"`; the scan page then offers only the code field.
// The camera starts on a tap (browsers require a gesture for audio, and it saves battery) and stops when the component goes away.
import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { Button } from '~/components/ui/button'
import { m } from '~/paraglide/messages'

/** Labels (QR), ISBNs and product codes (EAN-13), most shelf and part labels (Code 128). */
export const SCAN_FORMATS = ['qr_code', 'ean_13', 'code_128'] as const
const FRAME_MS = 125
/** The same code again within this time is the same scan. */
const REPEAT_MS = 2500

type Detected = { rawValue: string; format: string }
type Detector = { detect(source: HTMLVideoElement): Promise<Detected[]> }
type DetectorCtor = {
	new (opts?: { formats?: string[] }): Detector
	getSupportedFormats(): Promise<string[]>
}
const detectorCtor = () =>
	(globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector

export type ScanSupport = 'checking' | 'yes' | 'no'

/** Feature check: 'BarcodeDetector' in window and it reads QR codes. */
export function useScanSupport() {
	const [support, setSupport] = createSignal<ScanSupport>('checking')
	onMount(async () => {
		const D = detectorCtor()
		if (!D || !navigator.mediaDevices?.getUserMedia) return setSupport('no')
		try {
			const formats = await D.getSupportedFormats()
			setSupport(formats.includes('qr_code') ? 'yes' : 'no')
		} catch {
			setSupport('no')
		}
	})
	return support
}

function beep(ctx: AudioContext | undefined) {
	if (!ctx) return
	try {
		const osc = ctx.createOscillator()
		const gain = ctx.createGain()
		osc.frequency.value = 1760
		gain.gain.value = 0.08
		osc.connect(gain).connect(ctx.destination)
		osc.start()
		osc.stop(ctx.currentTime + 0.08)
	} catch {
		// no audio: the vibration and the result are enough
	}
}

export function CameraScanner(props: {
	onCode: (raw: string, format: string) => void
	/** Keep the camera on but stop reading (a result is being shown). */
	paused: boolean
}) {
	const [state, setState] = createSignal<'off' | 'starting' | 'on' | 'denied' | 'error'>('off')
	let video!: HTMLVideoElement
	let stream: MediaStream | undefined
	let detector: Detector | undefined
	let audio: AudioContext | undefined
	let frame = 0
	let last = 0
	let busy = false
	let lastHit = { value: '', at: 0 }

	function stop() {
		cancelAnimationFrame(frame)
		for (const t of stream?.getTracks() ?? []) t.stop()
		stream = undefined
		void audio?.close().catch(() => {})
		audio = undefined
		setState('off')
	}
	onCleanup(stop)

	function tick(now: number) {
		frame = requestAnimationFrame(tick)
		if (busy || props.paused || !detector || now - last < FRAME_MS || video.readyState < 2)
			return
		last = now
		busy = true
		detector
			.detect(video)
			.then((codes) => {
				const hit = codes.find((c) => c.rawValue)
				if (!hit) return
				const t = Date.now()
				if (hit.rawValue === lastHit.value && t - lastHit.at < REPEAT_MS) return
				lastHit = { value: hit.rawValue, at: t }
				navigator.vibrate?.(60)
				beep(audio)
				props.onCode(hit.rawValue, hit.format)
			})
			.catch(() => {})
			.finally(() => {
				busy = false
			})
	}

	async function start() {
		const D = detectorCtor()
		if (!D) return setState('error')
		setState('starting')
		try {
			const formats = await D.getSupportedFormats()
			detector = new D({ formats: SCAN_FORMATS.filter((f) => formats.includes(f)) })
			audio = typeof AudioContext === 'function' ? new AudioContext() : undefined
			stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
				audio: false,
			})
			video.srcObject = stream
			await video.play()
			setState('on')
			frame = requestAnimationFrame(tick)
		} catch (err) {
			stop()
			setState((err as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'error')
		}
	}

	return (
		<div class="grid gap-3">
			<div
				class="relative overflow-hidden rounded-lg border bg-black"
				classList={{ hidden: state() !== 'on' && state() !== 'starting' }}
			>
				<video
					ref={video}
					class="aspect-[3/4] w-full object-cover sm:aspect-video"
					muted
					playsinline
					aria-label={m.scan_camera_label()}
				/>
				<div
					class="pointer-events-none absolute inset-[18%] rounded-lg border-2 border-white/80"
					aria-hidden="true"
				/>
			</div>
			<Show when={state() === 'on' || state() === 'starting'}>
				<p class="text-sm text-muted-foreground" role="status">
					{state() === 'starting'
						? m.scan_camera_starting()
						: props.paused
							? m.scan_camera_paused()
							: m.scan_camera_hint()}
				</p>
				<div>
					<Button variant="outline" onClick={stop}>
						{m.scan_camera_stop()}
					</Button>
				</div>
			</Show>
			<Show when={state() === 'off' || state() === 'denied' || state() === 'error'}>
				<Button size="lg" class="w-full sm:w-auto" onClick={() => void start()}>
					{m.scan_camera_start()}
				</Button>
			</Show>
			<Show when={state() === 'denied'}>
				<p role="alert" class="text-sm text-destructive">
					{m.scan_camera_denied()}
				</p>
			</Show>
			<Show when={state() === 'error'}>
				<p role="alert" class="text-sm text-destructive">
					{m.scan_camera_error()}
				</p>
			</Show>
		</div>
	)
}
