import {
	IconCalendarEvent,
	IconCoins,
	IconCurrencyEuro,
	IconDashboard,
	IconExchange,
	IconMoon,
	IconReceipt,
	IconSun,
	IconWallet,
} from '@tabler/icons-solidjs'
import { type Component, createSignal, For, type JSX, onCleanup, onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import Accounts from './components/Accounts'
import Allocations from './components/Allocations'
import Currencies from './components/Currencies'
import Dashboard from './components/Dashboard'
import Events from './components/Events'
import Pools from './components/Pools'
import Transactions from './components/Transactions'
import './App.css'
import { LOCALES, type Locale, locale, setLocale, t } from './lib/i18n'
import { initThemeListener, theme, toggleTheme } from './lib/theme'

const VIEWS = [
	{ id: 'dashboard', comp: Dashboard, icon: IconDashboard },
	{ id: 'accounts', comp: Accounts, icon: IconWallet },
	{ id: 'transactions', comp: Transactions, icon: IconReceipt },
	{ id: 'pools', comp: Pools, icon: IconCoins },
	{ id: 'allocations', comp: Allocations, icon: IconExchange },
	{ id: 'events', comp: Events, icon: IconCalendarEvent },
	{ id: 'currencies', comp: Currencies, icon: IconCurrencyEuro },
] as const

type View = (typeof VIEWS)[number]['id']

const VIEW_MAP: Record<View, Component> = {
	dashboard: Dashboard,
	accounts: Accounts,
	transactions: Transactions,
	pools: Pools,
	allocations: Allocations,
	events: Events,
	currencies: Currencies,
}

const VIEW_IDS = new Set<string>(VIEWS.map((v) => v.id))

/** Parse `#/accounts` (also `#accounts`, `#/accounts?…`) with fallback to dashboard. */
function viewFromHash(): View {
	const raw = window.location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] ?? ''
	return (VIEW_IDS.has(raw) ? raw : 'dashboard') as View
}

function hashFor(view: View): string {
	return `#/${view}`
}

export default function App(): JSX.Element {
	const [view, setView] = createSignal<View>(viewFromHash())

	function navigate(next: View) {
		if (next === view()) {
			return
		}
		// Updating the hash drives the view via the `hashchange` listener,
		// so back/forward buttons and deep-links stay in sync for free.
		if (window.location.hash !== hashFor(next)) {
			window.location.hash = hashFor(next)
		} else {
			setView(next)
		}
	}

	onMount(() => {
		// Deep-link on load + fallback for unknown hashes.
		setView(viewFromHash())
		if (!window.location.hash || !VIEW_IDS.has(viewFromHash())) {
			window.location.hash = hashFor(viewFromHash())
		}
		const onHashChange = () => setView(viewFromHash())
		window.addEventListener('hashchange', onHashChange)
		const dispose = initThemeListener()
		onCleanup(() => {
			window.removeEventListener('hashchange', onHashChange)
			dispose()
		})
	})

	const isDark = () => theme() === 'dark'

	return (
		<div class="app">
			<aside class="sidebar">
				<div class="brand">
					<div class="brand-badge">H</div>
					<div>
						<div class="brand-name">Hausmeister</div>
					</div>
				</div>
				<nav class="nav" aria-label={t().nav.main}>
					<For each={VIEWS}>
						{(v) => (
							<button
								type="button"
								onClick={() => navigate(v.id)}
								class="nav-item"
								classList={{ 'nav-item--active': view() === v.id }}
								aria-current={view() === v.id ? 'page' : undefined}
							>
								<Dynamic component={v.icon} size={18} />
								<span>{(t().nav as Record<string, string>)[v.id] ?? v.id}</span>
							</button>
						)}
					</For>
				</nav>
				<div class="sidebar-footer">
					<label class="language-switcher">
						<span class="sr-only">{t().language.label}</span>
						<select
							value={locale()}
							onChange={(e) => setLocale(e.currentTarget.value as Locale)}
							class="input input--sm"
							aria-label={t().language.label}
						>
							<For each={LOCALES}>
								{(l) => <option value={l.code}>{l.label}</option>}
							</For>
						</select>
					</label>
					<button
						type="button"
						onClick={toggleTheme}
						class="btn-icon theme-toggle"
						aria-label={isDark() ? t().theme.toLight : t().theme.toDark}
						title={isDark() ? t().theme.lightTitle : t().theme.darkTitle}
					>
						{isDark() ? <IconSun size={18} /> : <IconMoon size={18} />}
					</button>
				</div>
			</aside>

			<div class="app-content">
				<main class="app-main">
					<Dynamic component={VIEW_MAP[view()]} />
				</main>
			</div>
		</div>
	)
}
