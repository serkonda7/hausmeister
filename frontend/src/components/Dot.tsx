import type { JSX } from 'solid-js'

interface DotProps {
	/** Dot fill color. Falls back to `--muted` gray when nullish. */
	color?: string | null
	/** Render the smaller `dot--sm` variant. */
	small?: boolean
	class?: string
	title?: string
	style?: JSX.CSSProperties
}

/**
 * Shared color dot: `<span class="dot">` with the `#9ca3af` fallback baked
 * in (previously triplicated inline at every call site).
 */
export default function Dot(props: DotProps): JSX.Element {
	return (
		<span
			class={`dot${props.small ? ' dot--sm' : ''}${props.class ? ` ${props.class}` : ''}`}
			style={{ background: props.color ?? '#9ca3af', ...props.style }}
			title={props.title}
		/>
	)
}
