// Content Security Policy for the app's HTML pages (DESIGN §8.4 "strict CSP").
// Scripts need the per-request nonce (the server-rendered shell's scripts all
// carry it, see src/lib/csp-nonce.ts) or must come from the app's own origin;
// there is no 'unsafe-inline' and no 'unsafe-eval'. /files/:id sends its own,
// stricter policy (attachments/serve.ts), which is kept.
//
// What the app uses, and where it is allowed:
//   own scripts, styles, fonts      'self'
//   photos and thumbnails           img-src 'self' (/files/:id)
//   uploader previews               img-src blob: (URL.createObjectURL)
//   camera capture                  <input capture>, no directive needed
//   passkeys                        WebAuthn is not governed by CSP
//   export download                 a same-origin navigation
// Only production sends it: Vite's dev server injects unnonced scripts and
// styles for HMR.
import { AsyncLocalStorage } from 'node:async_hooks'

export function buildCsp(nonce: string): string {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		`style-src 'self' 'nonce-${nonce}'`,
		// `style` attributes: rendered markup (tag colours, the nav grid, upload
		// progress) and Kobalte/Solid at runtime (popover position, scroll lock).
		// Attributes cannot load or run anything; <style> and scripts stay strict.
		"style-src-attr 'unsafe-inline'",
		"img-src 'self' blob: data:",
		"media-src 'self' blob:",
		"font-src 'self'",
		"connect-src 'self'",
		"worker-src 'self'",
		"manifest-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join('; ')
}

/** 16 random bytes, base64. */
export function newNonce(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64')
}

const G = globalThis as unknown as { __hausmeisterCsp?: AsyncLocalStorage<string> }
G.__hausmeisterCsp ??= new AsyncLocalStorage<string>()
const storage = G.__hausmeisterCsp

/** Runs `fn` with `nonce` as the request's CSP nonce (read by currentCspNonce()). */
export function withCspNonce<T>(nonce: string, fn: () => T): T {
	return storage.run(nonce, fn)
}

/** Adds the policy to HTML responses that have none yet. */
export function applyCsp(headers: Headers, nonce: string) {
	const type = headers.get('content-type') ?? ''
	if (!type.startsWith('text/html') || headers.has('content-security-policy')) return
	headers.set('Content-Security-Policy', buildCsp(nonce))
}
