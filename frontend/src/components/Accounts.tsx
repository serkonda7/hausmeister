import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { type Account, api } from '../lib/api'
import { patchForm } from '../lib/form'
import { accountTypeDescriptions, accountTypeLabels, formatEUR } from '../lib/format'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'

export default function Accounts() {
	const [accounts, { refetch }] = createResource(() => api.accounts.list())
	const [showForm, setShowForm] = createSignal(false)
	const [editing, setEditing] = createSignal<Account | null>(null)
	const [form, setForm] = createSignal({
		name: '',
		type: 'checking' as Account['type'],
		institution: '',
		openingDate: '',
		openingBalance: '',
		iban: '',
		notes: '',
	})
	const [error, setError] = createSignal('')

	const institutions = createMemo(() => {
		const seen = new Set<string>()
		for (const a of accounts() ?? []) {
			const name = a.institution?.trim()
			if (name) {
				seen.add(name)
			}
		}
		return [...seen].sort((x, y) => x.localeCompare(y))
	})

	function openCreate() {
		setEditing(null)
		setForm({
			name: '',
			type: 'checking',
			institution: '',
			openingDate: '',
			openingBalance: '',
			iban: '',
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
			openingDate: a.openingDate ?? '',
			openingBalance:
				a.openingBalanceCents != null ? (a.openingBalanceCents / 100).toString() : '',
			iban: a.iban ?? '',
			notes: a.notes ?? '',
		})
		setError('')
		setShowForm(true)
	}

	async function submit(e: Event) {
		e.preventDefault()
		setError('')
		const f = form()
		const openingBalanceCents =
			f.openingBalance.trim() === ''
				? null
				: Math.round(Number.parseFloat(f.openingBalance) * 100)
		if (openingBalanceCents !== null && Number.isNaN(openingBalanceCents)) {
			setError('Invalid opening balance')
			return
		}
		const payload: Omit<Account, 'id' | 'createdAt'> = {
			name: f.name,
			type: f.type,
			institution: f.institution.trim() || null,
			openingDate: f.openingDate || null,
			openingBalanceCents,
			iban: f.iban.trim() || null,
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
		if (!confirm('Really delete?')) {
			return
		}
		await api.accounts.remove(id)
		await refetch()
	}

	return (
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Accounts</h2>
				<button type="button" onClick={openCreate} class="btn-primary">
					+ Account
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
							Type
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
								title={accountTypeDescriptions[form().type] ?? ''}
							>
								<For each={Object.entries(accountTypeLabels)}>
									{([k, v]) => (
										<option value={k} title={accountTypeDescriptions[k] ?? ''}>
											{v}
										</option>
									)}
								</For>
							</select>
						</label>
						<label class="field">
							Institution{' '}
							<input
								value={form().institution}
								onInput={(e) =>
									patchForm(setForm, 'institution', e.currentTarget.value)
								}
								class="input"
								list="institution-options"
								placeholder="Select or type a new institution"
								autocomplete="off"
							/>
							<datalist id="institution-options">
								<For each={institutions()}>{(name) => <option value={name} />}</For>
							</datalist>
						</label>
						<label class="field" for="account-opening-date">
							Opening date{' '}
							<DateInput
								id="account-opening-date"
								value={form().openingDate}
								onInput={(v) => patchForm(setForm, 'openingDate', v)}
							/>
						</label>
						<label class="field">
							Opening balance (€){' '}
							<input
								type="number"
								step="0.01"
								value={form().openingBalance}
								onInput={(e) =>
									patchForm(setForm, 'openingBalance', e.currentTarget.value)
								}
								class="input"
							/>
						</label>
						<label class="field">
							IBAN{' '}
							<input
								value={form().iban}
								onInput={(e) => patchForm(setForm, 'iban', e.currentTarget.value)}
								class="input"
							/>
						</label>
					</div>
					<label class="field">
						Notes{' '}
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
							Cancel
						</button>
						<button type="submit" class="btn-primary">
							{editing() ? 'Save' : 'Create'}
						</button>
					</div>
				</form>
			</Show>

			<Show when={accounts.loading}>
				<p class="muted">Loading…</p>
			</Show>

			<div class="list">
				<For each={accounts() ?? []}>
					{(a) => (
						<div class="card card-row">
							<div>
								<div class="strong">
									{a.name}{' '}
									<span
										class="subtle"
										title={accountTypeDescriptions[a.type] ?? ''}
									>
										· {accountTypeLabels[a.type]}
									</span>
								</div>
								<div class="muted text-sm">
									{a.institution ?? '—'}
									<Show when={a.iban}> · {a.iban}</Show>
									<Show when={a.openingDate}> · opened {a.openingDate}</Show>
								</div>
							</div>
							<div class="card-actions">
								<div class="strong--bold" style={{ 'white-space': 'nowrap' }}>
									{a.openingBalanceCents != null
										? formatEUR(a.openingBalanceCents)
										: '—'}
								</div>
								<CrudRow onEdit={() => openEdit(a)} onDelete={() => remove(a.id)} />
							</div>
						</div>
					)}
				</For>
				<Show when={(accounts() ?? []).length === 0 && !accounts.loading}>
					<EmptyState>No accounts. Create your first account.</EmptyState>
				</Show>
			</div>
		</div>
	)
}
