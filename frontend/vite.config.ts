import { resolve } from 'node:path'
import devtools from 'solid-devtools/vite'
import { defineConfig } from 'vite'
import entryShakingPlugin from 'vite-plugin-entry-shaking'
import solidPlugin from 'vite-plugin-solid'

const tablerIconsEntry = resolve(
	import.meta.dirname,
	'node_modules/@tabler/icons-solidjs/dist/source/icons/index.js',
)

export default defineConfig({
	plugins: [
		entryShakingPlugin({
			targets: [tablerIconsEntry],
		}),
		devtools(),
		solidPlugin(),
	],
	resolve: {
		alias: {
			'@tabler/icons-solidjs': tablerIconsEntry,
		},
	},
	// Hardcoded ports: frontend 5174, backend API 3001. No env overrides.
	cacheDir: 'node_modules/.vite-5174',
	server: {
		port: 5174,
		strictPort: true,
		proxy: {
			'/api': {
				target: 'http://localhost:3001',
				changeOrigin: true,
			},
		},
	},
	build: {
		target: 'esnext',
	},
})
