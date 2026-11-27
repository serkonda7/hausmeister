// Turns uploaded bytes into what gets stored. Decides the type by content only
// (magic bytes, then sharp's own parse must agree), enforces the per-kind
// allow-list and the size limits, and re-encodes every image: auto-rotated,
// scaled to MAX_STORED_EDGE, ALL metadata (EXIF incl. GPS, XMP, IPTC, ICC)
// dropped. The raw upload is never written to disk, so a photo's location
// can never be served. PDFs are stored byte for byte.
import sharp, { type Metadata, type SharpOptions } from 'sharp'
import {
	ACCEPTED_MIMES,
	type AttachmentKind,
	isImageMime,
	MAX_FILE_BYTES,
	MAX_INPUT_PIXELS,
	MAX_STORED_EDGE,
	THUMB_EDGE,
} from '../../lib/attachments/rules'
import { type SniffedMime, sniffMime } from '../../lib/mime-sniff'
import { AttachmentError } from './errors'

export type StoredMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export type PreparedFile = { mime: StoredMime; data: Uint8Array }

// libvips works in its own thread pool, but decoding a 50 MP photo needs a few
// hundred MB; at most two images are processed at once.
const MAX_PARALLEL = 2
let running = 0
const waiting: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (running >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r))
	running++
	try {
		return await fn()
	} finally {
		running--
		waiting.shift()?.()
	}
}

const SHARP_INPUT: SharpOptions = {
	limitInputPixels: MAX_INPUT_PIXELS,
	failOn: 'error',
	sequentialRead: true,
	pages: 1, // first frame of an animated GIF/WebP only
}

/** What sharp's parser must report for each sniffed image type (polyglot guard). */
const SHARP_FORMAT: Record<string, string> = {
	'image/jpeg': 'jpeg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'heif',
	'image/heic': 'heif',
}

function decodeError(sniffed: SniffedMime, err: unknown): AttachmentError {
	const msg = err instanceof Error ? err.message : String(err)
	if (/pixel limit/i.test(msg)) return new AttachmentError(422, 'ATTACHMENTS_IMAGE_TOO_LARGE')
	if (sniffed === 'image/heic') return new AttachmentError(415, 'ATTACHMENTS_HEIC_UNSUPPORTED')
	return new AttachmentError(422, 'ATTACHMENTS_IMAGE_INVALID')
}

/** Validates and sanitizes an upload for `kind`. Throws AttachmentError. */
export async function prepareUpload(
	kind: AttachmentKind,
	bytes: Uint8Array,
): Promise<PreparedFile> {
	if (bytes.byteLength === 0) throw new AttachmentError(400, 'ATTACHMENTS_EMPTY')
	if (bytes.byteLength > MAX_FILE_BYTES) throw new AttachmentError(413, 'ATTACHMENTS_TOO_LARGE')
	const sniffed = sniffMime(bytes)
	if (!sniffed || !ACCEPTED_MIMES[kind].includes(sniffed)) {
		throw new AttachmentError(415, 'ATTACHMENTS_TYPE_REJECTED')
	}
	if (sniffed === 'application/pdf') return { mime: 'application/pdf', data: bytes }
	return withSlot(() => sanitizeImage(sniffed, bytes))
}

async function sanitizeImage(sniffed: SniffedMime, bytes: Uint8Array): Promise<PreparedFile> {
	let meta: Metadata
	try {
		meta = await sharp(bytes, SHARP_INPUT).metadata()
	} catch (err) {
		throw decodeError(sniffed, err)
	}
	if (meta.format !== SHARP_FORMAT[sniffed]) {
		throw new AttachmentError(422, 'ATTACHMENTS_IMAGE_INVALID')
	}
	if (sniffed === 'image/heic' && meta.compression !== 'av1') {
		// The prebuilt libvips in sharp ships libheif without an HEVC decoder.
		// Probe instead of assuming, so a future build that can decode just works.
		const ok = await sharp(bytes, SHARP_INPUT)
			.resize(8, 8)
			.raw()
			.toBuffer()
			.then(
				() => true,
				() => false,
			)
		if (!ok) throw new AttachmentError(415, 'ATTACHMENTS_HEIC_UNSUPPORTED')
	}
	const w = meta.width ?? 0
	const h = meta.height ?? 0
	if (!w || !h) throw new AttachmentError(422, 'ATTACHMENTS_IMAGE_INVALID')
	if (w * h > MAX_INPUT_PIXELS) throw new AttachmentError(422, 'ATTACHMENTS_IMAGE_TOO_LARGE')

	// No withMetadata()/keepExif(): sharp writes no EXIF, XMP, IPTC or ICC. Pixels
	// are converted to sRGB and rotated upright first, so nothing is lost visually.
	const pipeline = sharp(bytes, SHARP_INPUT).rotate().resize({
		width: MAX_STORED_EDGE,
		height: MAX_STORED_EDGE,
		fit: 'inside',
		withoutEnlargement: true,
	})
	let mime: StoredMime
	if (sniffed === 'image/png') {
		pipeline.png()
		mime = 'image/png'
	} else if (sniffed === 'image/webp') {
		pipeline.webp({ quality: 88 })
		mime = 'image/webp'
	} else if (sniffed === 'image/jpeg' || !meta.hasAlpha) {
		// GIF/AVIF/HEIC become JPEG (or PNG with transparency): formats every browser shows.
		pipeline.jpeg({ quality: 88, mozjpeg: true })
		mime = 'image/jpeg'
	} else {
		pipeline.png()
		mime = 'image/png'
	}
	try {
		const out = await pipeline.toBuffer()
		return { mime, data: new Uint8Array(out.buffer, out.byteOffset, out.byteLength) }
	} catch (err) {
		throw decodeError(sniffed, err)
	}
}

/** WebP thumbnail of a stored (already sanitized) image. */
export async function makeThumbnail(stored: Uint8Array): Promise<Uint8Array> {
	return withSlot(async () => {
		const out = await sharp(stored, SHARP_INPUT)
			.rotate()
			.resize({
				width: THUMB_EDGE,
				height: THUMB_EDGE,
				fit: 'inside',
				withoutEnlargement: true,
			})
			.webp({ quality: 75 })
			.toBuffer()
		return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
	})
}

export const hasThumbnail = (mime: string) => isImageMime(mime)
