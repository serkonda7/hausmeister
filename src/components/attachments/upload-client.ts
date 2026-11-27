// Browser side of the upload: optional downscaling of camera photos, then one
// XMLHttpRequest per file (fetch has no upload progress).
import {
	type AttachmentKind,
	CLIENT_JPEG_QUALITY,
	CLIENT_MAX_EDGE,
	uploadUrl,
} from '~/lib/attachments/rules'
import type { SerializedAttachment } from '~/server/authz/serialize'

/**
 * Phone photos (often 3–8 MB, 12–50 MP) are scaled to CLIENT_MAX_EDGE and
 * re-encoded as JPEG before they leave the phone: a fraction of the bytes over
 * a slow VPN link, and the EXIF/GPS block never travels. Only JPEGs for the
 * `photo` kind (receipts stay sharp); anything the browser cannot decode, or a
 * result that is not smaller, is uploaded as is. The server sanitizes anyway.
 */
export async function downscaleForUpload(file: File, kind: AttachmentKind): Promise<File> {
	if (kind !== 'photo' || file.type !== 'image/jpeg' || file.size < 1_000_000) return file
	if (typeof createImageBitmap !== 'function') return file
	try {
		const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
		const scale = Math.min(1, CLIENT_MAX_EDGE / Math.max(bmp.width, bmp.height))
		const w = Math.round(bmp.width * scale)
		const h = Math.round(bmp.height * scale)
		const canvas = document.createElement('canvas')
		canvas.width = w
		canvas.height = h
		const g = canvas.getContext('2d')
		if (!g) return file
		g.drawImage(bmp, 0, 0, w, h)
		bmp.close()
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', CLIENT_JPEG_QUALITY),
		)
		if (!blob || blob.size >= file.size) return file
		return new File([blob], file.name, { type: 'image/jpeg', lastModified: file.lastModified })
	} catch {
		return file
	}
}

export type UploadResult =
	| { ok: true; attachment: SerializedAttachment }
	| { ok: false; code: string; status: number }

/** Uploads one file. Never throws: network errors come back as code "NETWORK". */
export function uploadFile(
	itemId: string,
	kind: AttachmentKind,
	file: File,
	onProgress: (sentFraction: number) => void,
	signal?: AbortSignal,
): Promise<UploadResult> {
	return new Promise((resolve) => {
		const xhr = new XMLHttpRequest()
		xhr.open('POST', uploadUrl(itemId))
		xhr.responseType = 'json'
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress(e.loaded / e.total)
		}
		xhr.upload.onload = () => onProgress(1)
		xhr.onload = () => {
			const body = xhr.response as {
				attachment?: SerializedAttachment
				error?: string
			} | null
			if (xhr.status === 201 && body?.attachment) {
				resolve({ ok: true, attachment: body.attachment })
				return
			}
			const code =
				xhr.status === 401
					? 'Not authenticated'
					: xhr.status === 404
						? 'NOT_FOUND'
						: xhr.status === 403
							? 'FORBIDDEN'
							: xhr.status === 413
								? 'ATTACHMENTS_TOO_LARGE' // also when the proxy refuses first
								: (body?.error ?? 'SERVER')
			resolve({ ok: false, code, status: xhr.status })
		}
		xhr.onerror = () => resolve({ ok: false, code: 'NETWORK', status: 0 })
		xhr.onabort = () => resolve({ ok: false, code: 'NETWORK', status: 0 })
		signal?.addEventListener('abort', () => xhr.abort(), { once: true })
		const form = new FormData()
		form.set('kind', kind)
		form.set('file', file, file.name)
		xhr.send(form)
	})
}
