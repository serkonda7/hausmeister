// GET /api/v1/export: the caller's export as a streamed ZIP (DESIGN §7).
//  - guests: exactly what an unknown URL answers (see notFoundResponse), so
//    the endpoint's existence is not revealed (DESIGN §11).
//  - `?ticket=…` claims a slot reserved by reserveExportFn (the export page);
//    without one, the request acquires a slot itself (API clients).
//  - busy: 429 { error: "EXPORT_BUSY" } (this user) or "EXPORT_LIMIT" (overall);
//    a bad ticket: 409 { error: "EXPORT_TICKET_INVALID" }.
// The archive is produced while the client reads it (createProducerStream);
// the audit event `export.created` is written when it ends, completed or not.
import pkg from '../../../package.json' with { type: 'json' }
import { EXPORT_FORMAT } from '../../lib/export/types'
import { contentDisposition } from '../attachments/serve'
import type { BlobStore } from '../attachments/storage'
import { recordEvent } from '../audit'
import { exportScope } from '../authz'
import type { AuthCtx } from '../authz/ctx'
import type { AppDb } from '../db/client'
import { type ExportResult, writeExport } from './build'
import { type ExportRegistry, type ExportSlot, getExportRegistry } from './registry'
import { createProducerStream, ExportAborted } from './stream'

export const APP_VERSION: string = pkg.version

export type ExportHandlerDeps = {
	registry?: ExportRegistry
	/** Replaces the guest answer; the route passes the app's real not-found page. */
	notFound?: () => Response | Promise<Response>
	idleTimeoutMs?: number
	pageSize?: number
	now?: () => Date
}

const json = (status: number, error: string) =>
	Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } })

export function fileName(now: Date): string {
	const d = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Berlin',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	})
		.format(now)
		.replace(' ', '_')
		.replace(':', '-')
	return `${EXPORT_FORMAT}_${d}.zip`
}

export async function handleExportRequest(
	db: AppDb,
	ctx: AuthCtx,
	store: BlobStore,
	request: Request,
	deps: ExportHandlerDeps = {},
): Promise<Response> {
	if (exportScope(ctx) === 'none') return deps.notFound ? deps.notFound() : json(404, 'NOT_FOUND')
	const registry = deps.registry ?? getExportRegistry()
	const ticket = new URL(request.url).searchParams.get('ticket')
	let slot: ExportSlot
	if (ticket) {
		const claimed = registry.claim(ctx.userId, ticket)
		if (!claimed) return json(409, 'EXPORT_TICKET_INVALID')
		slot = claimed
	} else {
		const got = registry.acquire(ctx.userId)
		if (typeof got === 'string') return json(429, got)
		slot = got
	}
	const now = deps.now?.() ?? new Date()

	const body = createProducerStream(
		async (write) => {
			let result: ExportResult | null = null
			let reason: string | undefined
			try {
				result = await writeExport(write, {
					db,
					ctx,
					store,
					now,
					pageSize: deps.pageSize,
					progress: slot.progress,
					appVersion: APP_VERSION,
				})
			} catch (err) {
				reason = err instanceof ExportAborted ? err.reason : 'error'
				if (reason === 'error') console.error('[export] failed', err)
				throw err
			} finally {
				const bytes = result?.bytes ?? slot.progress.bytesWritten
				slot.release({ completed: !!result, bytes })
				try {
					recordEvent(db, {
						actorId: ctx.userId,
						action: 'export.created',
						diff: {
							scope: exportScope(ctx),
							completed: !!result,
							bytes,
							...(result ? { counts: result.counts } : { reason }),
						},
					})
				} catch (err) {
					console.error('[export] audit failed', err)
				}
			}
		},
		{ signal: request.signal, idleTimeoutMs: deps.idleTimeoutMs },
	)

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': contentDisposition('attachment', fileName(now)),
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
		},
	})
}
