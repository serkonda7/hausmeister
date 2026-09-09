import { createResource, For, Show } from 'solid-js'
import { type Allocation, api } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatEUR, liquidityLabels } from '../lib/format'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import { accountName, poolName } from '../lib/names'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'

export default function Allocations() {
	const [allocations, { refetch }] = createResource(() => api.allocations.list())
	const [accounts] = createResource(() => api.accounts.list())
	const [pools] = createResource(() => api.pools.list())

	const crud = useCrudForm<
		{
			poolId: string
			accountId: string
			amount: string
			liquidityOverride: string
			unlockAt: string
		},
		string
	>({
		poolId: '',
		accountId: '',
		amount: '',
		liquidityOverride: '',
		unlockAt: '',
	})
	const form = crud.form
	const setForm = crud.setForm

	function openCreate() {
		crud.openCreate({
			poolId: pools()?.[0]?.id ?? '',
			accountId: accounts()?.[0]?.id ?? '',
			amount: '',
			liquidityOverride: '',
			unlockAt: '',
		})
	}
	function openEdit(id: string) {
		const a = allocations()?.find((x) => x.id === id)
		if (!a) {
			return
		}
		crud.openEdit(id, {
			poolId: a.poolId,
			accountId: a.accountId,
			amount: centsToEuroInput(a.amountCents),
			liquidityOverride: a.liquidityOverride ?? '',
			unlockAt: a.unlockAt ?? '',
		})
	}

	function submit(e: Event) {
		return crud.submit(e, async () => {
			const f = form()
			const amountCents = parseEuroToCents(f.amount)
			if (!f.poolId || !f.accountId || amountCents == null || Number.isNaN(amountCents)) {
				throw new Error('Pool, account and amount are required')
			}
			const payload: Omit<Allocation, 'id' | 'createdAt'> = {
				poolId: f.poolId,
				accountId: f.accountId,
				amountCents,
				liquidityOverride: (f.liquidityOverride || null) as Allocation['liquidityOverride'],
				unlockAt: f.unlockAt || null,
			}
			const eid = crud.editing()
			if (eid) {
				await api.allocations.update(eid, payload)
			} else {
				await api.allocations.create(payload)
			}
			await refetch()
		})
	}

	function remove(id: string) {
		return removeWithConfirm('Delete allocation?', () => api.allocations.remove(id), refetch)
	}

	return (
		<div class="page">
			<div class="page-header">
				<h2 class="page-title">Allocations</h2>
				<button
					type="button"
					onClick={openCreate}
					class="btn-primary"
					disabled={(accounts()?.length ?? 0) === 0 || (pools()?.length ?? 0) === 0}
				>
					+ Allocation
				</button>
			</div>
			<Show when={(accounts()?.length ?? 0) === 0 || (pools()?.length ?? 0) === 0}>
				<p class="muted text-sm">Create accounts and pools first, then link allocations.</p>
			</Show>

			<CrudForm
				open={crud.showForm()}
				error={crud.error()}
				editing={crud.editing()}
				onSubmit={submit}
				onCancel={crud.close}
			>
				<div class="form-grid">
					<label class="field">
						Pool
						<select
							value={form().poolId}
							onChange={(e) => patchForm(setForm, 'poolId', e.currentTarget.value)}
							required
							class="input"
						>
							<For each={pools() ?? []}>
								{(p) => <option value={p.id}>{p.name}</option>}
							</For>
						</select>
					</label>
					<label class="field">
						Account
						<select
							value={form().accountId}
							onChange={(e) => patchForm(setForm, 'accountId', e.currentTarget.value)}
							required
							class="input"
						>
							<For each={accounts() ?? []}>
								{(a) => <option value={a.id}>{a.name}</option>}
							</For>
						</select>
					</label>
					<label class="field">
						Amount (€){' '}
						<input
							type="number"
							step="0.01"
							value={form().amount}
							onInput={(e) => patchForm(setForm, 'amount', e.currentTarget.value)}
							required
							class="input"
						/>
					</label>
					<label class="field">
						Availability
						<select
							value={form().liquidityOverride}
							onChange={(e) =>
								patchForm(setForm, 'liquidityOverride', e.currentTarget.value)
							}
							class="input"
						>
							<option value="">— Default from account</option>
							<For each={Object.entries(liquidityLabels)}>
								{([k, v]) => <option value={k}>{v}</option>}
							</For>
						</select>
					</label>
					<label class="field" for="allocation-unlock-at">
						Available from
						<DateInput
							id="allocation-unlock-at"
							value={form().unlockAt}
							onInput={(v) => patchForm(setForm, 'unlockAt', v)}
						/>
					</label>
				</div>
			</CrudForm>

			<div class="list list--tight">
				<For each={allocations() ?? []}>
					{(a) => (
						<div class="card card--compact card-row">
							<div>
								<div class="title">
									{poolName(pools(), a.poolId)}{' '}
									<span class="subtle">
										→ {accountName(accounts(), a.accountId)}
									</span>
								</div>
								<div class="muted text-sm">
									{a.liquidityOverride
										? `Override: ${liquidityLabels[a.liquidityOverride]}`
										: 'Default from account'}{' '}
									<Show when={a.unlockAt}>· from {a.unlockAt}</Show>
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
						No allocations. Distribute account balances across pools.
					</EmptyState>
				</Show>
			</div>
		</div>
	)
}
