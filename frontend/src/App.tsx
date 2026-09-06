import { IconMoon, IconSun } from '@tabler/icons-solidjs'
import { createSignal, type JSX, Match, onCleanup, onMount, Switch } from 'solid-js'
import Accounts from './components/Accounts'
import Allocations from './components/Allocations'
import Dashboard from './components/Dashboard'
import Events from './components/Events'
import Pools from './components/Pools'
import './App.css'
import { initThemeListener, theme, toggleTheme } from './lib/theme'

type View = 'dashboard' | 'accounts' | 'pools' | 'allocations' | 'events'

export default function App(): JSX.Element {
	const [view, setView] = createSignal<View>('dashboard')

	onMount(() => {
		const dispose = initThemeListener()
		onCleanup(dispose)
	})

	const navItem = (id: View, label: string) => (
		<button
			type="button"
			onClick={() => setView(id)}
			class="nav-item"
			classList={{ 'nav-item--active': view() === id }}
		>
			{label}
		</button>
	)

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
							{navItem('dashboard', 'Dashboard')}
							{navItem('accounts', 'Konten')}
							{navItem('pools', 'Pools')}
							{navItem('allocations', 'Zuweisungen')}
							{navItem('events', 'Zeitstrahl')}
						</nav>
						<button
							type="button"
							onClick={toggleTheme}
							class="btn-icon"
							aria-label={
								theme() === 'dark'
									? 'Zu hellem Modus wechseln'
									: 'Zu dunklem Modus wechseln'
							}
							title={theme() === 'dark' ? 'Hellmodus' : 'Dunkelmodus'}
						>
							{theme() === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
						</button>
					</div>
				</div>
			</header>

			<main class="app-main">
				<Switch>
					<Match when={view() === 'dashboard'}>
						<Dashboard />
					</Match>
					<Match when={view() === 'accounts'}>
						<Accounts />
					</Match>
					<Match when={view() === 'pools'}>
						<Pools />
					</Match>
					<Match when={view() === 'allocations'}>
						<Allocations />
					</Match>
					<Match when={view() === 'events'}>
						<Events />
					</Match>
				</Switch>
			</main>
		</div>
	)
}
