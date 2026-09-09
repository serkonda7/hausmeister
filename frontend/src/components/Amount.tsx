import type { JSX } from 'solid-js'
import { formatEUR } from '../lib/format'

export type AmountDirection = 'inflow' | 'outflow'

interface AmountProps {
	cents: number
	direction?: AmountDirection
	showSign?: boolean
	class?: string
}

/**
 * Shared amount badge: `+/-` + `formatEUR` with `amount--in/out` coloring.
 * Always `strong--bold` + `white-space: nowrap` (matches the three
 * previously triplicated call sites). Pass `class` to add a call-site
 * class (e.g. `row-amount` on the Dashboard) without losing the badge.
 */
export default function Amount(props: AmountProps): JSX.Element {
	const direction = (): AmountDirection =>
		props.direction ?? (props.cents >= 0 ? 'inflow' : 'outflow')
	const showSign = () => props.showSign ?? true

	return (
		<span
			class={`strong--bold${props.class ? ` ${props.class}` : ''}`}
			style={{ 'white-space': 'nowrap' }}
			classList={{
				'amount--in': direction() === 'inflow',
				'amount--out': direction() !== 'inflow',
			}}
		>
			{showSign() ? (direction() === 'inflow' ? '+' : '−') : null}
			{formatEUR(props.cents)}
		</span>
	)
}
