// GET /files/:attachmentId[?size=thumb] (DESIGN §6: never static). Authorized
// through loadAttachmentForCtx, so invisible items, receipts below `edit` and
// unknown ids all answer the same 404. The body is streamed from disk (Bun.file),
// single byte ranges are honoured, and the content hash is a strong ETag.
import type { AuthCtx } from '../authz/ctx'
import { loadAttachmentForCtx } from '../authz/serialize'
import type { AppDb } from '../db/client'
import { hasThumbnail } from './process'
import type { BlobStore } from './storage'
import { ensureThumbnail } from './thumbs'

const notFound = () =>
	new Response(JSON.stringify({ error: 'NOT_FOUND' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
	})

/** RFC 6266 / 5987 header value: an ASCII fallback plus the UTF-8 name. */
export function contentDisposition(type: 'inline' | 'attachment', name: string): string {
	const ascii = name
		.replace(/[^\x20-\x7e]/g, '_')
		.replace(/["\\]/g, '_')
		.replace(/[;%]/g, '_')
	const encoded = encodeURIComponent(name).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	)
	return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

const EXT: Record<string, string> = {
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
	'application/pdf': '.pdf',
}

function downloadName(original: string | null, mime: string, fallback: string): string {
	const ext = EXT[mime] ?? ''
	const base = (original ?? fallback).replace(/\.[^.]{1,8}$/, '')
	return `${base || fallback}${ext}`
}

/**
 * Images get `sandbox` (no script, opaque origin even when opened directly).
 * PDFs are shown by the browser's own viewer, which a CSP sandbox would block,
 * so they get a script-free policy instead; the viewer runs outside the page.
 */
function securityHeaders(mime: string): Record<string, string> {
	const pdf = mime === 'application/pdf'
	return {
		'X-Content-Type-Options': 'nosniff',
		'Content-Security-Policy': pdf
			? "default-src 'none'; object-src 'self'; frame-ancestors 'self'"
			: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
		'Cross-Origin-Resource-Policy': 'same-origin',
	}
}

function etagMatches(header: string | null, etag: string): boolean {
	if (!header) return false
	if (header.trim() === '*') return true
	return header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)
}

/** Parses a single `bytes=a-b` range. null = ignore (serve whole), "invalid" = 416. */
export function parseRange(
	header: string | null,
	size: number,
): { start: number; end: number } | null | 'invalid' {
	if (!header) return null
	const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
	if (!m) return null // multiple ranges or other units: send the whole file
	const [, a, b] = m
	if (a === '' && b === '') return null
	let start: number
	let end: number
	if (a === '') {
		const suffix = Number(b)
		if (suffix === 0) return 'invalid'
		start = Math.max(0, size - suffix)
		end = size - 1
	} else {
		start = Number(a)
		end = b === '' ? size - 1 : Math.min(Number(b), size - 1)
	}
	if (start >= size || start > end) return 'invalid'
	return { start, end }
}

export async function serveAttachment(
	db: AppDb,
	ctx: AuthCtx,
	store: BlobStore,
	request: Request,
	attachmentId: string,
): Promise<Response> {
	const found = loadAttachmentForCtx(db, ctx, attachmentId)
	if (!found) return notFound()
	const { attachment } = found
	const url = new URL(request.url)
	const thumb = url.searchParams.get('size') === 'thumb'

	let path: string
	let mime: string
	let etag: string
	let name: string
	if (thumb) {
		if (!hasThumbnail(attachment.mime)) return notFound()
		try {
			path = await ensureThumbnail(store, attachment.sha256)
		} catch (err) {
			console.error('[files] thumbnail failed', attachment.id, err)
			return notFound()
		}
		mime = 'image/webp'
		etag = `"${attachment.sha256}-t"`
		name = downloadName(attachment.originalName, 'image/webp', 'vorschau')
	} else {
		path = store.blobPath(attachment.sha256)
		mime = attachment.mime
		etag = `"${attachment.sha256}"`
		name = downloadName(attachment.originalName, mime, 'datei')
	}

	const file = Bun.file(path)
	if (!(await file.exists())) {
		console.error('[files] blob missing', attachment.id, attachment.sha256)
		return notFound()
	}
	const size = file.size
	const headers: Record<string, string> = {
		...securityHeaders(mime),
		'Content-Type': mime,
		'Content-Disposition': contentDisposition(
			url.searchParams.get('download') === '1' ? 'attachment' : 'inline',
			name,
		),
		ETag: etag,
		// Revalidate every time (cheap 304), so revoked access takes effect at once.
		'Cache-Control': 'private, no-cache',
		'Accept-Ranges': 'bytes',
	}

	if (etagMatches(request.headers.get('If-None-Match'), etag)) {
		return new Response(null, { status: 304, headers })
	}

	const ifRange = request.headers.get('If-Range')
	const range =
		ifRange && ifRange.trim() !== etag ? null : parseRange(request.headers.get('Range'), size)
	if (range === 'invalid') {
		return new Response(null, {
			status: 416,
			headers: { ...headers, 'Content-Range': `bytes */${size}` },
		})
	}
	if (range) {
		return new Response(file.slice(range.start, range.end + 1), {
			status: 206,
			headers: {
				...headers,
				'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
				'Content-Length': String(range.end - range.start + 1),
			},
		})
	}
	return new Response(request.method === 'HEAD' ? null : file, {
		status: 200,
		headers: { ...headers, 'Content-Length': String(size) },
	})
}
