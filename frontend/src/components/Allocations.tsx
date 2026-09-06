import { createResource, createSignal, For, Show } from 'solid-js'
import { type Allocation, api } from '../lib/api'
import { formatEUR, liquidityLabels } from '../lib/format'
import { patchForm } from '../lib/form'
import CrudRow from './CrudRow'
import EmptyState from './EmptyState'

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
		const payload: Omit<Allocation, 'id' | 'createdAt'> = {
			poolId: f.poolId,
			accountId: f.accountId,
			amountCents,
			liquidityOverride: (f.liquidityOverride ||
				null) as Allocation['liquidityOverride'],
			unlockAt: f.unlockAt || null,
		}
		try {
			const eid = editingId()
			if (eid) {
				await api.allocations.update(eid, payload)
			} else {
				await api.allocations.create(payload)
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
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Zuweisungen</h2>
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
				<p class="muted text-sm">
					Erst Konten und Pools anlegen, dann Zuweisungen verbinden.
				</p>
			</Show>

			<Show when={showForm()}>
				<form onSubmit={submit} class="form-card">
					<div class="form-grid">
						<label class="field">
							Pool
							<select
								value={form().poolId}
								onChange={(e) =>
									patchForm(setForm, 'poolId', e.currentTarget.value)
								}
								required
								class="input"
							>
								<For each={pools() ?? []}>
									{(p) => <option value={p.id}>{p.name}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Konto
							<select
								value={form().accountId}
								onChange={(e) =>
									patchForm(setForm, 'accountId', e.currentTarget.value)
								}
								required
								class="input"
							>
								<For each={accounts() ?? []}>
									{(a) => <option value={a.id}>{a.name}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Betrag (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().amount}
								onInput={(e) =>
									patchForm(setForm, 'amount', e.currentTarget.value)
								}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Verfügbarkeit
							<select
								value={form().liquidityOverride}
								onChange={(e) =>
									patchForm(setForm, 'liquidityOverride', e.currentTarget.value)
								}
								class="input"
							>
								<option value="">— Standard vom Konto</option>
								<For each={Object.entries(liquidityLabels)}>
									{([k, v]) => <option value={k}>{v}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Verfügbar ab
							<input
								type="date"
								value={form().unlockAt}
								onInput={(e) =>
									patchForm(setForm, 'unlockAt', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
					</div>
					<Show when={error()}>
						<p class="form-error">{error()}</p>
					</Show>
					<div class="form-actions">
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editingId() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<div class="list list--tight">
				<For each={allocations() ?? []}>
					{(a) => (
						<div class="card card--compact card-row">
							<div>
								<div class="title">
									{poolName(a.poolId)}{' '}
									<span class="subtle">→ {accountName(a.accountId)}</span>
								</div>
								<div class="muted text-sm">
									{a.liquidityOverride
										? `Abweichend: ${liquidityLabels[a.liquidityOverride]}`
										: 'Standard vom Konto'}{' '}
									<Show when={a.unlockAt}>· ab {a.unlockAt}</Show>
								</div>
							</div>
							<div class="card-actions">
								<span class="strong--bold">{formatEUR(a.amountCents)}</span>
								<CrudRow
									onEdit={() => openEdit(a.id)}
									onDelete={() => remove(a.id)}
								/>
							</div>
						</div>
					)}
				</For>
				<Show when={(allocations() ?? []).length === 0 && !allocations.loading}>
					<EmptyState>
						Keine Zuweisungen. Verteile Kontoguthaben auf Pools.
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
