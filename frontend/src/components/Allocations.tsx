import { IconPencil, IconTrash } from '@tabler/icons-solidjs'
import { createResource, createSignal, For, Show } from 'solid-js'
import { api } from '../lib/api'
import { formatEUR, liquidityLabels } from '../lib/format'

export default function Allocations() {
	const [allocations, { refetch }] = createResource(() => api.allocations.list())
	const [accounts] = createResource(() => api.accounts.list())
	const [pools] = createResource(() => api.pools.list())

	const [showForm, setShowForm] = createSignal(false)
	const [editingId, setEditingId] = createSignal<string | null>(null)
	const [error, setError] = createSignal('')
	const [form, setForm] = createSignal({
		poolId: '',
		accountId: '',
		amount: '',
		liquidityOverride: '' as string,
		unlockAt: '',
	})

	function openCreate() {
		setEditingId(null)
		setForm({
			poolId: pools()?.[0]?.id ?? '',
			accountId: accounts()?.[0]?.id ?? '',
			amount: '',
			liquidityOverride: '',
			unlockAt: '',
		})
		setError('')
		setShowForm(true)
	}
	function openEdit(id: string) {
		const a = allocations()?.find((x) => x.id === id)
		if (!a) {
			return
		}
		setEditingId(id)
		setForm({
			poolId: a.poolId,
			accountId: a.accountId,
			amount: (a.amountCents / 100).toString(),
			liquidityOverride: a.liquidityOverride ?? '',
			unlockAt: a.unlockAt ?? '',
		})
		setError('')
		setShowForm(true)
	}

	async function submit(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const amountCents = Math.round(Number.parseFloat(f.amount || '0') * 100)
		if (!f.poolId || !f.accountId || Number.isNaN(amountCents)) {
			setError('Pool, Konto und Betrag erforderlich')
			return
		}
		const payload = {
			poolId: f.poolId,
			accountId: f.accountId,
			amountCents,
			liquidityOverride: f.liquidityOverride || undefined,
			unlockAt: f.unlockAt || undefined,
		}
		try {
			const eid = editingId()
			if (eid) {
				await api.allocations.update(eid, payload as never)
			} else {
				await api.allocations.create(payload as never)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function remove(id: string) {
		if (!confirm('Zuweisung löschen?')) {
			return
		}
		await api.allocations.remove(id)
		await refetch()
	}

	function poolName(id: string): string {
		return pools()?.find((p) => p.id === id)?.name ?? id.slice(0, 8)
	}
	function accountName(id: string): string {
		return accounts()?.find((a) => a.id === id)?.name ?? id.slice(0, 8)
	}

	return (
		<div style={{ display: 'grid', gap: '1rem' }}>
			<div
				style={{
					display: 'flex',
					'justify-content': 'space-between',
					'align-items': 'center',
				}}
			>
				<h2 style={{ margin: 0, 'font-size': '1.125rem', 'font-weight': '600' }}>
					Zuweisungen
				</h2>
				<button
					type="button"
					onClick={openCreate}
					class="btn-primary"
					disabled={(accounts()?.length ?? 0) === 0 || (pools()?.length ?? 0) === 0}
				>
					+ Zuweisung
				</button>
			</div>
			<Show when={(accounts()?.length ?? 0) === 0 || (pools()?.length ?? 0) === 0}>
				<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
					Erst Konten und Pools anlegen, dann Zuweisungen verbinden.
				</p>
			</Show>

			<Show when={showForm()}>
				<form
					onSubmit={submit}
					style={{
						background: 'var(--surface)',
						border: '1px solid var(--border)',
						'border-radius': '12px',
						padding: '1rem',
						display: 'grid',
						gap: '0.75rem',
					}}
				>
					<div
						style={{
							display: 'grid',
							'grid-template-columns': '1fr 1fr',
							gap: '0.75rem',
						}}
					>
						<label style={labelStyle}>
							Pool
							<select
								value={form().poolId}
								onChange={(e) =>
									setForm({ ...form(), poolId: e.currentTarget.value })
								}
								required
								style={inputStyle}
							>
								<For each={pools() ?? []}>
									{(p) => <option value={p.id}>{p.name}</option>}
								</For>
							</select>
						</label>
						<label style={labelStyle}>
							Konto
							<select
								value={form().accountId}
								onChange={(e) =>
									setForm({ ...form(), accountId: e.currentTarget.value })
								}
								required
								style={inputStyle}
							>
								<For each={accounts() ?? []}>
									{(a) => <option value={a.id}>{a.name}</option>}
								</For>
							</select>
						</label>
						<label style={labelStyle}>
							Betrag (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().amount}
								onInput={(e) =>
									setForm({ ...form(), amount: e.currentTarget.value })
								}
								required
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Verfügbarkeit
							<select
								value={form().liquidityOverride}
								onChange={(e) =>
									setForm({ ...form(), liquidityOverride: e.currentTarget.value })
								}
								style={inputStyle}
							>
								<option value="">— Standard vom Konto</option>
								<For each={Object.entries(liquidityLabels)}>
									{([k, v]) => <option value={k}>{v}</option>}
								</For>
							</select>
						</label>
						<label style={labelStyle}>
							Verfügbar ab
							<input
								type="date"
								value={form().unlockAt}
								onInput={(e) =>
									setForm({ ...form(), unlockAt: e.currentTarget.value })
								}
								style={inputStyle}
							/>
						</label>
					</div>
					<Show when={error()}>
						<p style={{ color: 'var(--error)', 'font-size': '0.875rem' }}>{error()}</p>
					</Show>
					<div style={{ display: 'flex', gap: '0.5rem', 'justify-content': 'flex-end' }}>
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editingId() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<div style={{ display: 'grid', gap: '0.6rem' }}>
				<For each={allocations() ?? []}>
					{(a) => (
						<div
							style={{
								background: 'var(--surface)',
								border: '1px solid var(--border)',
								'border-radius': '12px',
								padding: '0.9rem',
								display: 'flex',
								'justify-content': 'space-between',
								'align-items': 'center',
								gap: '1rem',
							}}
						>
							<div>
								<div style={{ 'font-weight': '600', 'font-size': '0.9rem' }}>
									{poolName(a.poolId)}{' '}
									<span style={{ color: 'var(--muted)', 'font-weight': '400' }}>
										→ {accountName(a.accountId)}
									</span>
								</div>
								<div style={{ color: 'var(--muted)', 'font-size': '0.75rem' }}>
									{a.liquidityOverride
										? `Abweichend: ${liquidityLabels[a.liquidityOverride]}`
										: 'Standard vom Konto'}{' '}
									<Show when={a.unlockAt}>· ab {a.unlockAt}</Show>
								</div>
							</div>
							<div
								style={{ display: 'flex', gap: '0.5rem', 'align-items': 'center' }}
							>
								<span style={{ 'font-weight': '700' }}>
									{formatEUR(a.amountCents)}
								</span>
								<button
									type="button"
									onClick={() => openEdit(a.id)}
									class="btn-icon"
									aria-label="Bearbeiten"
									title="Bearbeiten"
								>
									<IconPencil size={18} />
								</button>
								<button
									type="button"
									onClick={() => remove(a.id)}
									class="btn-icon btn-icon--danger"
									aria-label="Löschen"
									title="Löschen"
								>
									<IconTrash size={18} />
								</button>
							</div>
						</div>
					)}
				</For>
				<Show when={(allocations() ?? []).length === 0 && !allocations.loading}>
					<p style={{ color: 'var(--muted)', 'font-size': '0.875rem' }}>
						Keine Zuweisungen. Verteile Kontoguthaben auf Pools.
					</p>
				</Show>
			</div>
		</div>
	)
}

const labelStyle: Record<string, string> = {
	display: 'grid',
	gap: '0.25rem',
	'font-size': '0.875rem',
}
const inputStyle: Record<string, string> = {
	border: '1px solid var(--border-strong)',
	'border-radius': '8px',
	padding: '0.5rem 0.6rem',
	'font-size': '0.875rem',
	background: 'var(--input-bg)',
	color: 'var(--text)',
}
