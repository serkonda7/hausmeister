import { createResource, For, Show } from 'solid-js'
import { type Allocation, api } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { formatDateISO, formatEUR, liquidityLabel } from '../lib/format'
import { t } from '../lib/i18n'
import { centsToEuroInput, parseEuroToCents } from '../lib/money'
import CrudForm from './CrudForm'
import CrudRow from './CrudRow'
import DateInput from './DateInput'
import EmptyState from './EmptyState'
import Field, { SelectField, TextField } from './Field'
import PageHeader from './PageHeader'
import './Allocations.css'

const LIQUIDITY_TIERS = ['instant', 'days', 'weeks', 'months', 'locked']

type AllocationForm = {
	poolId: string
	accountId: string
	amount: string
	liquidityOverride: string
	unlockAt: string
}

const EMPTY_FORM: AllocationForm = {
	poolId: '',
	accountId: '',
	amount: '',
	liquidityOverride: '',
	unlockAt: '',
}

export default function Allocations() {
	const [allocations, { refetch }] = createResource(() => api.allocations.list())
	const [accounts] = createResource(() => api.accounts.list())
	const [pools] = createResource(() => api.pools.list())

	const crud = useCrudForm<AllocationForm, string>({ ...EMPTY_FORM })
	const form = crud.form
	const setForm = crud.setForm

	function openCreate() {
		crud.openCreate({
			...EMPTY_FORM,
			poolId: pools()?.[0]?.id ?? '',
			accountId: accounts()?.[0]?.id ?? '',
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
				throw new Error(t().allocations.required)
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
		return removeWithConfirm(
			t().allocations.confirmDelete,
			() => api.allocations.remove(id),
			refetch,
		)
	}

	return (
		<div class="page">
			<PageHeader
				title={t().allocations.title}
				actions={
					<button
						type="button"
						onClick={openCreate}
						class="btn-primary"
						disabled={(accounts()?.length ?? 0) === 0 || (pools()?.length ?? 0) === 0}
					>
						{t().allocations.add}
					</button>
				}
			/>
			<Show when={(accounts()?.length ?? 0) === 0 || (pools()?.length ?? 0) === 0}>
				<p class="muted text-sm">{t().allocations.needFirst}</p>
			</Show>

			<CrudForm
				open={crud.showForm()}
				error={crud.error()}
				editing={crud.editing()}
				onSubmit={submit}
				onCancel={crud.close}
			>
				<div class="form-grid">
					<SelectField
						label={t().allocations.pool}
						required
						value={form().poolId}
						onChange={(v) => patchForm(setForm, 'poolId', v)}
					>
						<For each={pools() ?? []}>
							{(p) => <option value={p.id}>{p.name}</option>}
						</For>
					</SelectField>
					<SelectField
						label={t().allocations.account}
						required
						value={form().accountId}
						onChange={(v) => patchForm(setForm, 'accountId', v)}
					>
						<For each={accounts() ?? []}>
							{(a) => <option value={a.id}>{a.name}</option>}
						</For>
					</SelectField>
					<TextField
						label={t().allocations.amount}
						required
						type="number"
						step="0.01"
						value={form().amount}
						onInput={(v) => patchForm(setForm, 'amount', v)}
					/>
					<SelectField
						label={t().allocations.availability}
						value={form().liquidityOverride}
						onChange={(v) => patchForm(setForm, 'liquidityOverride', v)}
					>
						<option value="">{t().allocations.defaultFromAccount}</option>
						<For each={LIQUIDITY_TIERS}>
							{(k) => <option value={k}>{liquidityLabel(k)}</option>}
						</For>
					</SelectField>
					<Field label={t().allocations.availableFrom} for="allocation-unlock-at">
						<DateInput
							id="allocation-unlock-at"
							value={form().unlockAt}
							onInput={(v) => patchForm(setForm, 'unlockAt', v)}
						/>
					</Field>
				</div>
			</CrudForm>

			<div class="list list--tight">
				<For each={allocations() ?? []}>
					{(a) => {
						const pool = () => pools()?.find((p) => p.id === a.poolId)
						const account = () => accounts()?.find((x) => x.id === a.accountId)
						return (
							<div class="card card--compact card-row">
								<div>
									<div class="title">
										{pool()?.name ?? (
											<span class="unknown-ref" title={a.poolId}>
												{t().allocations.unknownRef}
											</span>
										)}{' '}
										<span class="subtle">
											→{' '}
											{account()?.name ?? (
												<span class="unknown-ref" title={a.accountId}>
													{t().allocations.unknownRef}
												</span>
											)}
										</span>
									</div>
									<div class="muted text-sm">
										{a.liquidityOverride
											? `${t().allocations.overridePrefix}: ${liquidityLabel(a.liquidityOverride)}`
											: t().allocations.defaultFrom}{' '}
										<Show when={a.unlockAt}>
											{t().allocations.fromPrefix}
											{a.unlockAt ? formatDateISO(a.unlockAt) : ''}
										</Show>
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
						)
					}}
				</For>
				<Show when={(allocations() ?? []).length === 0 && !allocations.loading}>
					<EmptyState>{t().allocations.empty}</EmptyState>
				</Show>
			</div>
		</div>
	)
}
