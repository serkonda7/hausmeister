import { expect, test } from '@playwright/test'

test('ctrl+k focuses the global search', async ({ page }) => {
	await page.route('**/api/**', async (route) => {
		const url = new URL(route.request().url())
		if (url.pathname === '/api/auth/status') {
			await route.fulfill({
				json: {
					setupRequired: false,
					user: { id: 'u1', username: 'tester', displayName: 'Test', isAdmin: false, createdAt: 0 },
				},
			})
			return
		}
		await route.fulfill({
			json: { books: [], authors: [], tags: [], publishers: [], locations: [] },
		})
	})
	await page.goto('/')
	const search = page.getByRole('textbox', { name: /search|suche/i }).first()
	await expect(search).toBeVisible()
	await expect(search).not.toBeFocused()
	await page.keyboard.press('Control+k')
	await expect(search).toBeFocused()
})
