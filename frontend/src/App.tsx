import { IconMoon, IconSun } from '@tabler/icons-solidjs'
import { createSignal, For, type JSX, onCleanup, onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import Accounts from './components/Accounts'
import Allocations from './components/Allocations'
import Dashboard from './components/Dashboard'
import Events from './components/Events'
import Pools from './components/Pools'
import './App.css'
import { initThemeListener, theme, toggleTheme } from './lib/theme'

const VIEWS = [
	{ id: 'dashboard', label: 'Dashboard', comp: Dashboard },
	{ id: 'accounts', label: 'Konten', comp: Accounts },
	{ id: 'pools', label: 'Pools', comp: Pools },
	{ id: 'allocations', label: 'Zuweisungen', comp: Allocations },
	{ id: 'events', label: 'Zeitstrahl', comp: Events },
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
			<header class="app-header">
				<div class="app-header-inner">
					<div class="brand">
						<div class="brand-badge">H</div>
						<div>
							<div class="brand-name">Hausmeister</div>
						</div>
					</div>
					<div class="header-actions">
						<nav class="nav">
							<For each={VIEWS}>
								{(v) => (
									<button
										type="button"
										onClick={() => setView(v.id)}
										class="nav-item"
										classList={{ 'nav-item--active': view() === v.id }}
									>
										{v.label}
									</button>
								)}
							</For>
						</nav>
						<button
							type="button"
							onClick={toggleTheme}
							class="btn-icon"
							aria-label={
								isDark() ? 'Zu hellem Modus wechseln' : 'Zu dunklem Modus wechseln'
							}
							title={isDark() ? 'Hellmodus' : 'Dunkelmodus'}
						>
							{isDark() ? <IconSun size={18} /> : <IconMoon size={18} />}
						</button>
					</div>
				</div>
			</header>

			<main class="app-main">
				{/* biome-ignore lint/style/noNonNullAssertion: ids only come from VIEWS */}
				<Dynamic component={VIEWS.find((v) => v.id === view())!.comp} />
			</main>
		</div>
	)
}
