import { expect, test } from '@playwright/test'

// Guards tablerIcons() in frontend/vite.config.ts: if @tabler/icons-solidjs ever
// resolves to its barrel again, dev loads all ~6000 icon modules and hangs.
test('dev server loads only the icon modules the app uses', async ({ page }) => {
	await page.route('**/api/**', async (route) => {
		const url = new URL(route.request().url())
		if (url.pathname === '/api/auth/status') {
			await route.fulfill({
				json: {
					setupRequired: false,
					user: { id: 'u1', username: 'tester', displayName: 'Test', isAdmin: true, createdAt: 0 },
				},
			})
			return
		}
		await route.fulfill({
			json: { books: [], authors: [], tags: [], publishers: [], locations: [] },
		})
	})
	const iconModules = new Set<string>()
	page.on('request', (request) => {
		const { pathname } = new URL(request.url())
		if (pathname.includes('/@tabler/icons-solidjs/')) iconModules.add(pathname)
	})
	await page.goto('/')
	await expect(page.getByRole('textbox', { name: /search|suche/i }).first()).toBeVisible()
	expect(iconModules.size).toBeGreaterThan(0)
	expect(iconModules.size).toBeLessThan(200)
})
