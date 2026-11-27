// QR codes for labels (DESIGN §5.2): the module matrix from `qrcode` and an SVG path for it, so labels render as plain markup on the server and in the browser (no canvas, no data: URLs, nothing for the CSP to allow).
import QRCode from 'qrcode'

export type QrMatrix = { size: number; dark: (row: number, col: number) => boolean }

/** Error correction M: survives a scratched label, keeps short URLs at version 3 (29×29). */
export function qrMatrix(text: string): QrMatrix {
	const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
	return { size: modules.size, dark: (r, c) => !!modules.get(r, c) }
}

/**
 * One path for all dark modules, offset by `margin` (the quiet zone), in module units: viewBox="0 0 size+2m size+2m".
 * Horizontal runs are merged.
 */
export function qrPath(m: QrMatrix, margin = 2): string {
	const parts: string[] = []
	for (let r = 0; r < m.size; r++) {
		let c = 0
		while (c < m.size) {
			if (!m.dark(r, c)) {
				c++
				continue
			}
			const start = c
			while (c < m.size && m.dark(r, c)) c++
			parts.push(`M${start + margin} ${r + margin}h${c - start}v1h-${c - start}z`)
		}
	}
	return parts.join('')
}

/** The URL a label encodes: the phone's camera app opens it too. */
export const labelUrl = (origin: string, shortCode: string) =>
	`${origin.replace(/\/+$/, '')}/q/${shortCode}`

/**
 * The short code in a scanned value: a label URL (any host, path /q/CODE) or a bare code.
 * Null for anything else (EAN, ISBN, foreign QR codes).
 */
export function shortCodeFromScan(raw: string, isCode: (s: string) => boolean): string | null {
	const v = raw.trim()
	const m = v.match(/^https?:\/\/[^/\s]+\/q\/([A-Za-z0-9]{4,12})\/?$/i)
	if (m?.[1]) return m[1].toUpperCase()
	return isCode(v) ? v.toUpperCase() : null
}
