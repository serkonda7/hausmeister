// Outline icons from Tabler Icons (MIT, https://tabler.io/icons), inlined as
// path data so they render without a dependency or extra requests.
// Add an icon by copying the `d` attributes of its outline SVG.
import { For, splitProps } from 'solid-js'

const PATHS = {
	'address-book': [
		'M20 6v12a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2',
		'M10 16h6',
		'M11 11a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
		'M4 8h3',
		'M4 12h3',
		'M4 16h3',
	],
	'arrows-exchange': ['M7 10h14l-4 -4', 'M17 14h-14l4 4'],
	bell: [
		'M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6',
		'M9 17v1a3 3 0 0 0 6 0v-1',
	],
	category: [
		'M4 4h6v6h-6l0 -6',
		'M14 4h6v6h-6l0 -6',
		'M4 14h6v6h-6l0 -6',
		'M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
	],
	'chevrons-left': ['M11 7l-5 5l5 5', 'M17 7l-5 5l5 5'],
	'chevrons-right': ['M7 7l5 5l-5 5', 'M13 7l5 5l-5 5'],
	download: ['M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2', 'M7 11l5 5l5 -5', 'M12 4l0 12'],
	home: [
		'M5 12l-2 0l9 -9l9 9l-2 0',
		'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7',
		'M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6',
	],
	logout: [
		'M14 8v-2a2 2 0 0 0 -2 -2h-7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7a2 2 0 0 0 2 -2v-2',
		'M9 12h12l-3 -3',
		'M18 15l3 -3',
	],
	mail: [
		'M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10',
		'M3 7l9 6l9 -6',
	],
	'map-pin': [
		'M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
		'M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0',
	],
	menu: ['M4 6l16 0', 'M4 12l16 0', 'M4 18l16 0'],
	package: [
		'M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5',
		'M12 12l8 -4.5',
		'M12 12l0 9',
		'M12 12l-8 -4.5',
		'M16 5.25l-8 4.5',
	],
	plus: ['M12 5l0 14', 'M5 12l14 0'],
	qrcode: [
		'M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
		'M7 17l0 .01',
		'M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
		'M7 7l0 .01',
		'M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4',
		'M17 7l0 .01',
		'M14 14l3 0',
		'M20 14l0 .01',
		'M14 14l0 3',
		'M14 20l3 0',
		'M17 17l3 0',
		'M20 17l0 3',
	],
	scan: [
		'M5 12h14',
		'M3 7v-2a2 2 0 0 1 2 -2h2',
		'M3 17v2a2 2 0 0 0 2 2h2',
		'M17 3h2a2 2 0 0 1 2 2v2',
		'M17 21h2a2 2 0 0 0 2 -2v-2',
	],
	search: ['M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
	settings: [
		'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065',
		'M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
	],
	tags: [
		'M3 8v4.172a2 2 0 0 0 .586 1.414l5.71 5.71a2.41 2.41 0 0 0 3.408 0l3.592 -3.592a2.41 2.41 0 0 0 0 -3.408l-5.71 -5.71a2 2 0 0 0 -1.414 -.586h-4.172a2 2 0 0 0 -2 2',
		'M18 19l1.592 -1.592a4.82 4.82 0 0 0 0 -6.816l-4.592 -4.592',
		'M7 10h-.01',
	],
	user: ['M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0', 'M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2'],
	'user-circle': [
		'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
		'M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
		'M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855',
	],
	'users-group': [
		'M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
		'M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1',
		'M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
		'M17 10h2a2 2 0 0 1 2 2v1',
		'M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0',
		'M3 13v-1a2 2 0 0 1 2 -2h2',
	],
	x: ['M18 6l-12 12', 'M6 6l12 12'],
} as const

export type IconName = keyof typeof PATHS

/** A decorative 24×24 outline icon (aria-hidden; label the control around it). */
export function Icon(props: { name: IconName; size?: number; class?: string }) {
	const [local] = splitProps(props, ['name', 'size', 'class'])
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={local.size ?? 20}
			height={local.size ?? 20}
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			class={local.class ? `shrink-0 ${local.class}` : 'shrink-0'}
		>
			<For each={PATHS[local.name]}>{(d) => <path d={d} />}</For>
		</svg>
	)
}
