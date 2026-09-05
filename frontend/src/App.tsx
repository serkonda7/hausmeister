import { IconMoon, IconSun } from '@tabler/icons-solidjs'
import { createSignal, type JSX, Match, onCleanup, onMount, Switch } from 'solid-js'
import Accounts from './components/Accounts'
import Allocations from './components/Allocations'
import Dashboard from './components/Dashboard'
import Events from './components/Events'
import Pools from './components/Pools'
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
			style={{
				background: view() === id ? 'var(--primary)' : 'transparent',
				color: view() === id ? 'var(--primary-text)' : 'var(--text-secondary)',
				border: view() === id ? '1px solid var(--primary)' : '1px solid var(--border)',
				'border-radius': '999px',
				padding: '0.4rem 0.85rem',
				'font-size': '0.875rem',
				'font-weight': '500',
				cursor: 'pointer',
			}}
		>
			{label}
		</button>
	)

	return (
		<div
			style={{
				'min-height': '100vh',
				background: 'var(--bg)',
				color: 'var(--text)',
				'font-family': 'ui-sans-system, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
			}}
		>
			<header
				style={{
					position: 'sticky',
					top: '0',
					background: 'var(--surface)',
					border: '1px solid var(--border)',
					'border-bottom': '1px solid var(--border)',
					'z-index': '10',
				}}
			>
				<div
					style={{
						'max-width': '1100px',
						margin: '0 auto',
						padding: '0.9rem 1rem',
						display: 'flex',
						'align-items': 'center',
						'justify-content': 'space-between',
						gap: '1rem',
						'flex-wrap': 'wrap',
					}}
				>
					<div style={{ display: 'flex', 'align-items': 'center', gap: '0.75rem' }}>
						<div
							style={{
								width: '32px',
								height: '32px',
								'border-radius': '8px',
								background: 'var(--primary)',
								color: 'var(--primary-text)',
								display: 'grid',
								'place-items': 'center',
								'font-weight': '700',
								'font-size': '0.85rem',
							}}
						>
							H
						</div>
						<div>
							<div style={{ 'font-weight': '700', 'letter-spacing': '-0.02em' }}>
								Hausmeister
							</div>
						</div>
					</div>
					<div
						style={{
							display: 'flex',
							gap: '0.75rem',
							'align-items': 'center',
							'flex-wrap': 'wrap',
						}}
					>
						<nav style={{ display: 'flex', gap: '0.5rem', 'flex-wrap': 'wrap' }}>
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

			<main style={{ 'max-width': '1100px', margin: '0 auto', padding: '1.25rem 1rem 3rem' }}>
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
