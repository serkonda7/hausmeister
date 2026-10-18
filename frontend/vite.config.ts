import { tablerIcons } from '@serkonda7/solid-components/vite'
import devtools from 'solid-devtools/vite'
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
	// tablerIcons() must stay first: without it dev loads all ~6000 icon modules.
	plugins: [tablerIcons(), devtools(), solidPlugin()],
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
