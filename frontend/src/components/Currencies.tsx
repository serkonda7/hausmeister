import { createMemo, createResource, createSignal, For, Show } from 'solid-js'
import { api, type CurrencyCode } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { currencySymbol, formatDateISO, formatMoney, formatRate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import CrudForm from './CrudForm'
import DateInput from './DateInput'
import EmptyState from './EmptyState'
import './Currencies.css'

type Pair = 'EURUSD' | 'USDEUR'

function pairLegs(pair: Pair): { from: CurrencyCode; to: CurrencyCode } {
	return pair === 'EURUSD' ? { from: 'EUR', to: 'USD' } : { from: 'USD', to: 'EUR' }
}

export default function Currencies() {
	const [currencies, { refetch: refetchCurrencies }] = createResource(() => api.currencies.list())
	const [currError, setCurrError] = createSignal('')

	const [pair, setPair] = createSignal<Pair>('EURUSD')
	const from = () => pairLegs(pair()).from
	const to = () => pairLegs(pair()).to

	const [rates, { refetch: refetchRates }] = createResource(pair, async () => {
		const { from: f, to: tt } = pairLegs(pair())
		return api.exchangeRates.list(f, tt, 180)
	})

	const [downloading, setDownloading] = createSignal(false)
	const [downloadMsg, setDownloadMsg] = createSignal('')
	const [ratesError, setRatesError] = createSignal('')

	// Converter (Firefly converts back to the base currency; we convert either way).
	const [convFrom, setConvFrom] = createSignal<CurrencyCode>('EUR')
	const [convTo, setConvTo] = createSignal<CurrencyCode>('USD')
	const [convAmount, setConvAmount] = createSignal('100')
	const [convDate, setConvDate] = createSignal('')
	const [conversion] = createResource(
		() => ({ f: convFrom(), t: convTo(), d: convDate() || undefined }),
		async (k) => {
			try {
				return await api.exchangeRates.convert(k.f, k.t, k.d)
			} catch {
				return null
			}
		},
	)

	const convResult = createMemo(() => {
		const amount = Number.parseFloat(convAmount())
		const rate = conversion()?.rate
		if (!Number.isFinite(amount) || rate == null) {
			return null
		}
		return amount * rate
	})

	// Manual rate entry (Firefly: "you can set any rate you want, in both directions").
	const rateCrud = useCrudForm<{ date: string; rate: string }, never>({
		date: todayISO(),
		rate: '',
	})

	async function setDefault(code: CurrencyCode) {
		setCurrError('')
		try {
			await api.currencies.update(code, { isDefault: true })
			await refetchCurrencies()
		} catch (err) {
			setCurrError((err as Error).message)
		}
	}

	async function download() {
		setDownloading(true)
		setRatesError('')
		setDownloadMsg('')
		try {
			const res = await api.exchangeRates.download(90)
			await refetchRates()
			setDownloadMsg(
				`${res.fetched} ${t().currencies.downloadedSummary} ${res.source} (${res.inserted} new, ${res.updated} updated)`,
			)
		} catch (err) {
			setRatesError((err as Error).message)
		} finally {
			setDownloading(false)
		}
	}

	function submitRate(e: Event) {
		return rateCrud.submit(e, async () => {
			const f = rateCrud.form()
			if (!f.date) {
				throw new Error(t().currencies.dateRequired)
			}
			const rate = Number.parseFloat(f.rate)
			if (!Number.isFinite(rate) || rate <= 0) {
				throw new Error(t().currencies.invalidRate)
			}
			await api.exchangeRates.create({ fromCode: from(), toCode: to(), date: f.date, rate })
			await refetchRates()
		})
	}

	function removeRate(date: string) {
		return removeWithConfirm(
			t().currencies.confirmDeleteRate,
			() => api.exchangeRates.remove(date),
			refetchRates,
		)
	}

	return (
		<div class="page page--spacious">
			<div class="page-header">
				<div>
					<h2 class="page-title">{t().currencies.title}</h2>
				</div>
			</div>

			<section class="card" aria-label={t().currencies.listTitle}>
				<h3 class="curr-heading">{t().currencies.listTitle}</h3>
				<Show when={currencies.loading}>
					<p class="muted">{t().common.loading}</p>
				</Show>
				<Show when={currError()}>
					<p class="form-error">{currError()}</p>
				</Show>
				<Show when={(currencies() ?? []).length > 0}>
					<div class="curr-table-wrap">
						<table class="curr-table">
							<thead>
								<tr>
									<th scope="col">{t().currencies.code}</th>
									<th scope="col">{t().currencies.name}</th>
									<th scope="col">{t().currencies.symbol}</th>
									<th scope="col" class="num">
										{t().currencies.decimals}
									</th>
									<th scope="col" class="cell-actions">
										<span class="sr-only">{t().currencies.actions}</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={currencies() ?? []}>
									{(cur) => (
										<tr>
											<td class="cell-main">
												<span class="curr-badges">
													{cur.code}
													<Show when={cur.isDefault}>
														<span class="badge badge--default">
															{t().currencies.defaultBadge}
														</span>
													</Show>
												</span>
											</td>
											<td>{cur.name}</td>
											<td>{cur.symbol || currencySymbol(cur.code)}</td>
											<td class="num">{cur.decimalPlaces}</td>
											<td class="cell-actions">
												<span class="curr-actions">
													<Show when={!cur.isDefault}>
														<button
															type="button"
															class="btn-ghost btn-ghost--sm"
															onClick={() => setDefault(cur.code)}
														>
															{t().currencies.setDefault}
														</button>
													</Show>
												</span>
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
				</Show>
			</section>

			<section class="card" aria-label={t().currencies.converterTitle}>
				<h3 class="curr-heading">{t().currencies.converterTitle}</h3>
				<p class="muted text-sm">{t().currencies.converterHint}</p>
				<div class="converter-grid">
					<label class="field">
						{t().currencies.amount}
						<input
							type="number"
							min="0"
							step="0.01"
							value={convAmount()}
							onInput={(e) => setConvAmount(e.currentTarget.value)}
							class="input"
						/>
					</label>
					<label class="field">
						{t().currencies.from}
						<select
							value={convFrom()}
							onChange={(e) => setConvFrom(e.currentTarget.value as CurrencyCode)}
							class="input"
						>
							<option value="EUR">EUR (€)</option>
							<option value="USD">USD ($)</option>
						</select>
					</label>
					<label class="field">
						{t().currencies.to}
						<select
							value={convTo()}
							onChange={(e) => setConvTo(e.currentTarget.value as CurrencyCode)}
							class="input"
						>
							<option value="EUR">EUR (€)</option>
							<option value="USD">USD ($)</option>
						</select>
					</label>
					<label class="field" for="conv-date">
						{t().currencies.date} ({t().currencies.latest})
						<DateInput id="conv-date" value={convDate()} onInput={setConvDate} />
					</label>
				</div>
				<Show when={conversion.loading}>
					<p class="muted text-sm">{t().common.loading}</p>
				</Show>
				<Show when={!conversion.loading && conversion()}>
					{(c) => {
						const conv = c()
						const rateDate = conv.rateDate
						return (
							<p class="converter-result">
								<span class="strong--bold">
									{formatMoney(Math.round((convResult() ?? 0) * 100), convTo())}
								</span>{' '}
								<span class="muted text-sm">
									1 {conv.fromCode} = {formatRate(conv.rate)} {conv.toCode}
									{rateDate ? ` · ${formatDateISO(rateDate)}` : ''}
								</span>
							</p>
						)
					}}
				</Show>
				<Show when={!conversion.loading && !conversion()}>
					<p class="muted text-sm">{t().currencies.noRate}</p>
				</Show>
			</section>

			<section class="card" aria-label={t().currencies.ratesTitle}>
				<div class="rates-toolbar">
					<h3 class="curr-heading">{t().currencies.ratesTitle}</h3>
					<div class="inline-row">
						<label class="field field--inline">
							<span class="sr-only">{t().currencies.pair}</span>
							<select
								value={pair()}
								onChange={(e) => setPair(e.currentTarget.value as Pair)}
								class="input input--sm"
							>
								<option value="EURUSD">EUR → USD</option>
								<option value="USDEUR">USD → EUR</option>
							</select>
						</label>
						<button
							type="button"
							class="btn-primary"
							disabled={downloading()}
							onClick={download}
						>
							{downloading() ? t().currencies.downloading : t().currencies.download}
						</button>
						<button
							type="button"
							class="btn-ghost"
							onClick={() => rateCrud.openCreate({ date: todayISO(), rate: '' })}
						>
							{t().currencies.addRate}
						</button>
					</div>
				</div>
				<p class="muted text-sm">{t().currencies.sourceNote}</p>
				<Show when={downloadMsg()}>
					<p class="text-sm download-msg">{downloadMsg()}</p>
				</Show>
				<Show when={ratesError()}>
					<p class="form-error">{ratesError()}</p>
				</Show>

				<CrudForm
					open={rateCrud.showForm()}
					error={rateCrud.error()}
					editing={rateCrud.editing()}
					onSubmit={submitRate}
					onCancel={rateCrud.close}
				>
					<div class="form-grid">
						<label class="field" for="rate-date">
							<span class="field-label">
								{t().currencies.date}{' '}
								<span class="req" aria-hidden="true">
									*
								</span>
							</span>
							<DateInput
								id="rate-date"
								value={rateCrud.form().date}
								onInput={(v) => patchForm(rateCrud.setForm, 'date', v)}
							/>
						</label>
						<label class="field">
							<span class="field-label">
								{t().currencies.rateField} ({from()} → {to()}){' '}
								<span class="req" aria-hidden="true">
									*
								</span>
							</span>
							<input
								type="number"
								min="0"
								step="0.0001"
								value={rateCrud.form().rate}
								onInput={(e) =>
									patchForm(rateCrud.setForm, 'rate', e.currentTarget.value)
								}
								required
								aria-required="true"
								class="input"
							/>
						</label>
					</div>
					<p class="form-hint">
						{t().currencies.rateHint} ({t().currencies.perUnit} 1 {from()})
					</p>
				</CrudForm>

				<Show when={rates.loading}>
					<p class="muted">{t().common.loading}</p>
				</Show>
				<Show when={(rates() ?? []).length > 0 && !rates.loading}>
					<div class="curr-table-wrap curr-table-wrap--scroll">
						<table class="curr-table">
							<thead>
								<tr>
									<th scope="col">{t().currencies.tableDate}</th>
									<th scope="col" class="num">
										{t().currencies.tableRate} ({from()} → {to()})
									</th>
									<th scope="col" class="num">
										{t().currencies.tableInverse} ({to()} → {from()})
									</th>
									<th scope="col" class="cell-actions">
										<span class="sr-only">{t().common.delete}</span>
									</th>
								</tr>
							</thead>
							<tbody>
								<For each={rates() ?? []}>
									{(r) => (
										<tr>
											<td class="cell-main">{formatDateISO(r.date)}</td>
											<td class="num">{formatRate(r.rate)}</td>
											<td class="num muted">{formatRate(1 / r.rate)}</td>
											<td class="cell-actions">
												<button
													type="button"
													class="btn-icon btn-icon--danger"
													onClick={() => removeRate(r.date)}
													aria-label={t().common.delete}
													title={t().currencies.confirmDeleteRate}
												>
													×
												</button>
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
					</div>
				</Show>
				<Show when={(rates() ?? []).length === 0 && !rates.loading}>
					<EmptyState actionLabel={t().currencies.emptyRatesAction} onAction={download}>
						{t().currencies.emptyRates}
					</EmptyState>
				</Show>
			</section>
		</div>
	)
}
