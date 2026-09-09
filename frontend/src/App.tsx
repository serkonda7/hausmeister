import {
	IconCalendarEvent,
	IconCoins,
	IconDashboard,
	IconExchange,
	IconMoon,
	IconReceipt,
	IconSun,
	IconWallet,
} from '@tabler/icons-solidjs'
import { createSignal, For, type JSX, onCleanup, onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import Accounts from './components/Accounts'
import Allocations from './components/Allocations'
import Dashboard from './components/Dashboard'
import Events from './components/Events'
import Pools from './components/Pools'
import Transactions from './components/Transactions'
import './App.css'
import { initThemeListener, theme, toggleTheme } from './lib/theme'

const VIEWS = [
	{ id: 'dashboard', label: 'Übersicht', comp: Dashboard, icon: IconDashboard },
	{ id: 'accounts', label: 'Konten', comp: Accounts, icon: IconWallet },
	{ id: 'transactions', label: 'Buchungen', comp: Transactions, icon: IconReceipt },
	{ id: 'pools', label: 'Pools', comp: Pools, icon: IconCoins },
	{ id: 'allocations', label: 'Zuordnungen', comp: Allocations, icon: IconExchange },
	{ id: 'events', label: 'Ereignisse', comp: Events, icon: IconCalendarEvent },
] as const

type View = (typeof VIEWS)[number]['id']

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
				<nav class="nav" aria-label="Hauptnavigation">
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
								<span>{v.label}</span>
							</button>
						)}
					</For>
				</nav>
				<div class="sidebar-footer">
					<button
						type="button"
						onClick={toggleTheme}
						class="btn-icon theme-toggle"
						aria-label={
							isDark() ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'
						}
						title={isDark() ? 'Heller Modus' : 'Dunkler Modus'}
					>
						{isDark() ? <IconSun size={18} /> : <IconMoon size={18} />}
					</button>
				</div>
			</aside>

			<div class="app-content">
				<main class="app-main">
					{/* biome-ignore lint/style/noNonNullAssertion: ids only come from VIEWS */}
					<Dynamic component={VIEWS.find((v) => v.id === view())!.comp} />
				</main>
			</div>
		</div>
	)
}
