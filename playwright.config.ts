import { defineConfig } from '@playwright/test'

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.e2e.ts',
	use: {
		baseURL: 'http://127.0.0.1:5174',
		headless: true,
	},
	webServer: {
		command: 'bun run --cwd frontend dev -- --host 127.0.0.1',
		url: 'http://127.0.0.1:5174',
		reuseExistingServer: true,
	},
})
