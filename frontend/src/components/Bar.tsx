import type { JSX } from 'solid-js'

interface BarProps {
	/** Fill width in percent (0–100, clamped inside). */
	value: number
	/** Explicit fill color (e.g. `liquidityColors[tier]`). Omit to use `tone`. */
	color?: string
	/** Semantic fill class (`bar-fill--ok` / `bar-fill--warn`). */
	tone?: 'ok' | 'warn'
	/** Render the thinner `bar-track--thin` variant. */
	thin?: boolean
	/** Overlay inside the track (e.g. the pool target marker). */
	children?: JSX.Element
}

/**
 * Shared progress bar: `<div class="bar-track">` + fill. Covers the
 * liquidity bars and the pool bars (thin + tone + target-marker overlay)
 * on the Dashboard.
 */
export default function Bar(props: BarProps): JSX.Element {
	const width = () => `${Math.min(100, Math.max(0, props.value))}%`
	return (
		<div class={`bar-track${props.thin ? ' bar-track--thin' : ''}`}>
			<div
				class="bar-fill"
				classList={{
					'bar-fill--ok': props.tone === 'ok',
					'bar-fill--warn': props.tone === 'warn',
				}}
				style={{
					width: width(),
					...(props.color ? { background: props.color } : {}),
				}}
			/>
			{props.children}
		</div>
	)
}
