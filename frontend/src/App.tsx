import { createSignal, type JSX, Match, Switch } from 'solid-js'
import Accounts from './components/Accounts'
import Allocations from './components/Allocations'
import Dashboard from './components/Dashboard'
import Events from './components/Events'
import Pools from './components/Pools'

type View = 'dashboard' | 'accounts' | 'pools' | 'allocations' | 'events'

export default function App(): JSX.Element {
	const [view, setView] = createSignal<View>('dashboard')

	const navItem = (id: View, label: string) => (
		<button
			type="button"
			onClick={() => setView(id)}
			style={{
				background: view() === id ? '#111827' : 'transparent',
				color: view() === id ? 'white' : '#374151',
				border: view() === id ? '1px solid #111827' : '1px solid #e5e7eb',
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
				background: '#f9fafb',
				color: '#111827',
				'font-family': 'ui-sans-system, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
			}}
		>
			<header
				style={{
					position: 'sticky',
					top: '0',
					background: 'white',
					border: '1px solid #e5e7eb',
					'border-bottom': '1px solid #e5e7eb',
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
								background: '#111827',
								color: 'white',
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
							<div style={{ color: '#6b7280', 'font-size': '0.75rem' }}>
								Finanzen · minimal & klar · EUR
							</div>
						</div>
					</div>
					<nav style={{ display: 'flex', gap: '0.5rem', 'flex-wrap': 'wrap' }}>
						{navItem('dashboard', 'Dashboard')}
						{navItem('accounts', 'Konten')}
						{navItem('pools', 'Pools')}
						{navItem('allocations', 'Zuweisungen')}
						{navItem('events', 'Zeitstrahl')}
					</nav>
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

			<footer
				style={{
					'text-align': 'center',
					color: '#9ca3af',
					'font-size': '0.75rem',
					padding: '1.5rem',
				}}
			>
				Lokal · SQLite · Keine Cloud · EUR only
			</footer>
		</div>
	)
}
