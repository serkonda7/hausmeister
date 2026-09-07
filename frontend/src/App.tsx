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
	{ id: 'dashboard', label: 'Dashboard', comp: Dashboard, icon: IconDashboard },
	{ id: 'accounts', label: 'Accounts', comp: Accounts, icon: IconWallet },
	{ id: 'transactions', label: 'Transactions', comp: Transactions, icon: IconReceipt },
	{ id: 'pools', label: 'Pools', comp: Pools, icon: IconCoins },
	{ id: 'allocations', label: 'Allocations', comp: Allocations, icon: IconExchange },
	{ id: 'events', label: 'Timeline', comp: Events, icon: IconCalendarEvent },
] as const

type View = (typeof VIEWS)[number]['id']

export default function App(): JSX.Element {
	const [view, setView] = createSignal<View>('dashboard')

	onMount(() => {
		const dispose = initThemeListener()
		onCleanup(dispose)
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
				<nav class="nav" aria-label="Main navigation">
					<For each={VIEWS}>
						{(v) => (
							<button
								type="button"
								onClick={() => setView(v.id)}
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
							isDark() ? 'Switch to light mode' : 'Switch to dark mode'
						}
						title={isDark() ? 'Light mode' : 'Dark mode'}
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
