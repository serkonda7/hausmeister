import { DataTable, type DataTableColumn } from '@serkonda7/solid-components'
import type { LoginAuditEntry, LoginAuditPage } from 'shared/src/book'
import { createMemo, createResource, createSignal, Show } from 'solid-js'
import { api, errorMessage } from '../api'
import { ErrorText } from '../components/common'
import { locale, t } from '../i18n'

export function AuditLogPage() {
	const [cursors, setCursors] = createSignal<string[]>([])
	const [result, { refetch }] = createResource(
		() => ({ before: cursors().at(-1) }),
		({ before }) =>
			api<LoginAuditPage>(`/audit-log${before ? `?before=${encodeURIComponent(before)}` : ''}`),
	)
	const columns = createMemo((): DataTableColumn<LoginAuditEntry>[] => [
		{
			key: 'occurredAt',
			label: t('auditLog.time'),
			getValue: (entry) => (
				<time dateTime={new Date(entry.occurredAt).toISOString()}>
					{new Date(entry.occurredAt).toLocaleString(locale())}
				</time>
			),
		},
		{
			key: 'username',
			label: t('auth.username'),
			getValue: (entry) => entry.username || t('common.unknown'),
		},
		{
			key: 'outcome',
			label: t('auditLog.outcome'),
			getValue: (entry) => t(`auditLog.${entry.outcome}`),
		},
		{
			key: 'sourceIp',
			label: t('auditLog.sourceIp'),
			getValue: (entry) => <code>{entry.sourceIp ?? t('auditLog.unavailable')}</code>,
		},
		{
			key: 'status',
			label: t('auditLog.httpStatus'),
			getValue: (entry) => entry.status,
		},
	])

	function refresh(): void {
		if (cursors().length) setCursors([])
		else void refetch()
	}

	return (
		<>
			<section class="library-head">
				<div>
					<h2>{t('nav.auditLog')}</h2>
					<p class="muted small">{t('auditLog.description')}</p>
				</div>
				<button type="button" class="ghost" disabled={result.loading} onClick={refresh}>
					{t('auditLog.refresh')}
				</button>
			</section>
			<ErrorText message={result.error ? errorMessage(result.error, 'auditLog.loadError') : null} />
			<Show when={result.loading}>
				<p class="muted" role="status">
					{t('auditLog.loading')}
				</p>
			</Show>
			<Show when={!result.loading && !result.error && result()}>
				{(data) => (
					<>
						<Show
							when={data().entries.length}
							fallback={<p class="muted">{t('auditLog.empty')}</p>}
						>
							<DataTable
								class="table-wrap"
								rows={data().entries}
								columns={columns()}
								getRowId={(entry) => String(entry.id)}
							/>
						</Show>
						<div class="form-actions">
							<button
								type="button"
								class="ghost"
								disabled={!cursors().length}
								onClick={() => setCursors((previous) => previous.slice(0, -1))}
							>
								{t('auditLog.newer')}
							</button>
							<button
								type="button"
								class="ghost"
								disabled={!data().nextCursor}
								onClick={() => {
									const next = data().nextCursor
									if (next) setCursors((previous) => [...previous, next])
								}}
							>
								{t('auditLog.older')}
							</button>
						</div>
					</>
				)}
			</Show>
		</>
	)
}
