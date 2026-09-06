import { createResource, createSignal, For, Show } from 'solid-js'
import { type Account, api } from '../lib/api'
import { accountTypeLabels, formatEUR, liquidityLabels } from '../lib/format'
import { patchForm } from '../lib/form'
import CrudRow from './CrudRow'
import EmptyState from './EmptyState'

export default function Accounts() {
	const [accounts, { refetch }] = createResource(() => api.accounts.list())
	const [showForm, setShowForm] = createSignal(false)
	const [editing, setEditing] = createSignal<Account | null>(null)
	const [form, setForm] = createSignal({
		name: '',
		type: 'checking' as Account['type'],
		institution: '',
		liquidityTier: 'instant' as Account['liquidityTier'],
		balance: '',
		unlockAt: '',
		notes: '',
	})
	const [error, setError] = createSignal('')

	function openCreate() {
		setEditing(null)
		setForm({
			name: '',
			type: 'checking',
			institution: '',
			liquidityTier: 'instant',
			balance: '',
			unlockAt: '',
			notes: '',
		})
		setError('')
		setShowForm(true)
	}
	function openEdit(a: Account) {
		setEditing(a)
		setForm({
			name: a.name,
			type: a.type,
			institution: a.institution ?? '',
			liquidityTier: a.liquidityTier,
			balance: (a.balanceCents / 100).toString(),
			unlockAt: a.unlockAt ?? '',
			notes: a.notes ?? '',
		})
		setError('')
		setShowForm(true)
	}

	async function submit(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const balanceCents = Math.round(Number.parseFloat(f.balance || '0') * 100)
		if (Number.isNaN(balanceCents)) {
			setError('Ungültiger Betrag')
			return
		}
		const payload: Omit<Account, 'id' | 'createdAt'> = {
			name: f.name,
			type: f.type,
			institution: f.institution || null,
			liquidityTier: f.liquidityTier,
			balanceCents,
			unlockAt: f.unlockAt || null,
			notes: f.notes || null,
		}
		try {
			const current = editing()
			if (current) {
				await api.accounts.update(current.id, payload)
			} else {
				await api.accounts.create(payload)
			}
			setShowForm(false)
			await refetch()
		} catch (err) {
			setError((err as Error).message)
		}
	}

	async function remove(id: string) {
		if (!confirm('Wirklich löschen?')) {
			return
		}
		await api.accounts.remove(id)
		await refetch()
	}

	return (
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Konten</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Konto
				</button>
			</div>

			<Show when={showForm()}>
				<form onSubmit={submit} class="form-card">
					<div class="form-grid">
						<label class="field">
							Name{' '}
							<input
								value={form().name}
								onInput={(e) => patchForm(setForm, 'name', e.currentTarget.value)}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Typ
							<select
								value={form().type}
								onChange={(e) =>
									patchForm(
										setForm,
										'type',
										e.currentTarget.value as Account['type'],
									)
								}
								class="input"
							>
								<For each={Object.entries(accountTypeLabels)}>
									{([k, v]) => <option value={k}>{v}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Institut{' '}
							<input
								value={form().institution}
								onInput={(e) =>
									patchForm(setForm, 'institution', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							Verfügbarkeit
							<select
								value={form().liquidityTier}
								onChange={(e) =>
									patchForm(
										setForm,
										'liquidityTier',
										e.currentTarget.value as Account['liquidityTier'],
									)
								}
								class="input"
							>
								<For each={Object.entries(liquidityLabels)}>
									{([k, v]) => <option value={k}>{v}</option>}
								</For>
							</select>
						</label>
						<label class="field">
							Saldo (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().balance}
								onInput={(e) =>
									patchForm(setForm, 'balance', e.currentTarget.value)
								}
								required
								class="input"
							/>
						</label>
						<label class="field">
							Verfügbar ab{' '}
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
					<label class="field">
						Notizen{' '}
						<input
							value={form().notes}
							onInput={(e) => patchForm(setForm, 'notes', e.currentTarget.value)}
							class="input"
						/>
					</label>
					<Show when={error()}>
						<p class="form-error">{error()}</p>
					</Show>
					<div class="form-actions">
						<button type="button" onClick={() => setShowForm(false)} class="btn-ghost">
							Abbrechen
						</button>
						<button type="submit" class="btn-primary">
							{editing() ? 'Speichern' : 'Anlegen'}
						</button>
					</div>
				</form>
			</Show>

			<Show when={accounts.loading}>
				<p class="muted">Laden…</p>
			</Show>

			<div class="list">
				<For each={accounts() ?? []}>
					{(a) => (
						<div class="card card-row">
							<div>
								<div class="strong">
									{a.name}{' '}
									<span class="subtle">· {accountTypeLabels[a.type]}</span>
								</div>
								<div class="muted text-sm">
									{a.institution ?? '—'} · {liquidityLabels[a.liquidityTier]}
									<Show when={a.unlockAt}> · ab {a.unlockAt}</Show>
								</div>
							</div>
							<div class="card-actions">
								<div class="strong--bold" style={{ 'white-space': 'nowrap' }}>
									{formatEUR(a.balanceCents)}
								</div>
								<CrudRow onEdit={() => openEdit(a)} onDelete={() => remove(a.id)} />
							</div>
						</div>
					)}
				</For>
				<Show when={(accounts() ?? []).length === 0 && !accounts.loading}>
					<EmptyState>Keine Konten. Lege dein erstes Konto an.</EmptyState>
				</Show>
			</div>
		</div>
	)
}
