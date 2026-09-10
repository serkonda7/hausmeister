import { createResource, createSignal, For, Show } from 'solid-js'
import { api, type CurrencyCode } from '../lib/api'
import { removeWithConfirm, useCrudForm } from '../lib/crud'
import { patchForm } from '../lib/form'
import { currencySymbol, formatDateISO, formatRate, todayISO } from '../lib/format'
import { t } from '../lib/i18n'
import CrudForm from './CrudForm'
import DateInput from './DateInput'
import EmptyState from './EmptyState'
import ListState from './ListState'
import PageHeader from './PageHeader'
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
	const [showDownload, setShowDownload] = createSignal(false)
	const [dlFrom, setDlFrom] = createSignal('')
	const [dlTo, setDlTo] = createSignal('')
	const [dlStoreAll, setDlStoreAll] = createSignal(false)

	function shiftISO(iso: string, deltaDays: number): string {
		const [y, m, d] = iso.split('-').map(Number)
		const dt = new Date(y, (m || 1) - 1, d || 1)
		dt.setDate(dt.getDate() + deltaDays)
		return todayISO(dt)
	}

	function openDownload() {
		const today = todayISO()
		if (!dlTo()) {
			setDlTo(today)
		}
		if (!dlFrom()) {
			setDlFrom(shiftISO(dlTo() || today, -30))
		}
		setRatesError('')
		setShowDownload(true)
	}

	function closeDownload() {
		if (!downloading()) {
			setShowDownload(false)
		}
	}

	// Manual rate entry (Firefly: "you can set any rate you want, in both directions").
	function emptyRateForm(): { date: string; rate: string } {
		return { date: todayISO(), rate: '' }
	}
	const rateCrud = useCrudForm<{ date: string; rate: string }, never>(emptyRateForm())

	async function setDefault(code: CurrencyCode) {
		setCurrError('')
		try {
			await api.currencies.update(code, { isDefault: true })
			await refetchCurrencies()
		} catch (err) {
			setCurrError((err as Error).message)
		}
	}

	async function download(e?: Event) {
		e?.preventDefault()
		const dic = t().currencies
		const rangeFrom = dlFrom()
		const rangeTo = dlTo()
		if (!rangeFrom || !rangeTo) {
			setRatesError(dic.downloadRangeRequired)
			return
		}
		if (rangeFrom > rangeTo) {
			setRatesError(dic.downloadRangeOrder)
			return
		}
		const spanDays =
			Math.round(
				(new Date(`${rangeTo}T00:00:00Z`).getTime() -
					new Date(`${rangeFrom}T00:00:00Z`).getTime()) /
					86_400_000,
			) + 1
		if (spanDays > 365) {
			setRatesError(dic.downloadRangeTooLong)
			return
		}
		setDownloading(true)
		setRatesError('')
		setDownloadMsg('')
		try {
			const res = await api.exchangeRates.download({
				from: rangeFrom,
				to: rangeTo,
				storeAll: dlStoreAll(),
			})
			await refetchRates()
			const start = res.start ?? rangeFrom
			const end = res.end ?? rangeTo
			setDownloadMsg(
				`${res.fetched} ${dic.downloadedSummary} ${res.source} (${res.inserted} ${dic.downloadedNew}, ${res.updated} ${dic.downloadedUpdated}) · ${formatDateISO(start)} → ${formatDateISO(end)}`,
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
		<div class="page page--spacious currencies-page">
			<PageHeader title={t().currencies.title} />

			<section class="card" aria-label={t().currencies.listTitle}>
				<h3 class="curr-heading">{t().currencies.listTitle}</h3>
				<ListState loading={currencies.loading} error={currError()} />
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

			<section class="card rates-card" aria-label={t().currencies.ratesTitle}>
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
						<button type="button" class="btn-primary" onClick={openDownload}>
							{t().currencies.download}
						</button>
						<button
							type="button"
							class="btn-ghost"
							onClick={() => rateCrud.openCreate(emptyRateForm())}
						>
							{t().currencies.addRate}
						</button>
					</div>
				</div>
				<Show when={showDownload()}>
					<div
						class="form-card"
						role="dialog"
						aria-label={t().currencies.downloadDialogTitle}
						onKeyDown={(e) => {
							if (e.key === 'Escape') {
								e.stopPropagation()
								closeDownload()
							}
						}}
					>
						<h4 class="curr-heading">{t().currencies.downloadDialogTitle}</h4>
						<form onSubmit={download}>
							<div class="form-grid">
								<label class="field" for="dl-from">
									<span class="field-label">{t().currencies.downloadFrom}</span>
									<DateInput id="dl-from" value={dlFrom()} onInput={setDlFrom} />
								</label>
								<label class="field" for="dl-to">
									<span class="field-label">{t().currencies.downloadTo}</span>
									<DateInput id="dl-to" value={dlTo()} onInput={setDlTo} />
								</label>
							</div>
							<p class="form-hint">{t().currencies.downloadSource}</p>
							<label class="field field--checkbox">
								<input
									type="checkbox"
									checked={dlStoreAll()}
									onChange={(e) => setDlStoreAll(e.currentTarget.checked)}
								/>{' '}
								{t().currencies.downloadStoreAll}
							</label>
							<Show when={downloadMsg()}>
								<p class="text-sm download-msg">{downloadMsg()}</p>
							</Show>
							<Show when={ratesError()}>
								<p class="form-error">{ratesError()}</p>
							</Show>
							<div class="form-actions">
								<button
									type="button"
									class="btn-ghost"
									onClick={closeDownload}
									disabled={downloading()}
								>
									{t().common.cancel}
								</button>
								<button type="submit" class="btn-primary" disabled={downloading()}>
									{downloading()
										? t().currencies.downloading
										: t().currencies.download}
								</button>
							</div>
						</form>
					</div>
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

				<ListState loading={rates.loading} />
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
					<EmptyState
						actionLabel={t().currencies.emptyRatesAction}
						onAction={openDownload}
					>
						{t().currencies.emptyRates}
					</EmptyState>
				</Show>
			</section>
		</div>
	)
}
