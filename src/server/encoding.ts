// Small encoding helpers on web APIs (Uint8Array base64, getRandomValues), so server code needs no Node Buffer.

const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })

/** `bytes` random bytes as unpadded base64url (URL- and cookie-safe). */
export function randomToken(bytes: number): string {
	return crypto
		.getRandomValues(new Uint8Array(bytes))
		.toBase64({ alphabet: 'base64url', omitPadding: true })
}

/** An opaque page cursor: JSON as unpadded base64url. */
export function encodeCursor(value: unknown): string {
	return enc.encode(JSON.stringify(value)).toBase64({ alphabet: 'base64url', omitPadding: true })
}

/** The JSON inside a cursor. Throws on anything that is not base64url-encoded UTF-8 JSON; callers still check the shape. */
export function decodeCursor(raw: string): unknown {
	return JSON.parse(dec.decode(Uint8Array.fromBase64(raw, { alphabet: 'base64url' })))
}
