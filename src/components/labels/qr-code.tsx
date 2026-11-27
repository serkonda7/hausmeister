// A QR code as inline SVG (src/lib/qr.ts): crisp at any print size, no canvas.
import { createMemo } from 'solid-js'
import { qrMatrix, qrPath } from '~/lib/qr'

export function QrCode(props: { value: string; label: string; class?: string; margin?: number }) {
	const shape = createMemo(() => {
		const mx = qrMatrix(props.value)
		const margin = props.margin ?? 2
		return { d: qrPath(mx, margin), n: mx.size + 2 * margin }
	})
	return (
		<svg
			viewBox={`0 0 ${shape().n} ${shape().n}`}
			class={props.class}
			role="img"
			aria-label={props.label}
			shape-rendering="crispEdges"
		>
			<rect width={shape().n} height={shape().n} fill="#fff" />
			<path d={shape().d} fill="#000" />
		</svg>
	)
}
