import { expect, test } from '@playwright/test'

test('creating an author leaves the dropdown responsive for selection', async ({ page }) => {
	let authors = [{ id: 'author-1', name: 'Ursula Le Guin' }]

	await page.route('**/api/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())

		if (url.pathname === '/api/auth/status') {
			await route.fulfill({
				json: {
					setupRequired: false,
					user: {
						id: 'user-1',
						username: 'tester',
						displayName: 'Test User',
						isAdmin: false,
						createdAt: 0,
					},
				},
			})
			return
		}

		if (url.pathname === '/api/authors' && request.method() === 'GET') {
			await route.fulfill({ json: { authors } })
			return
		}

		if (url.pathname === '/api/authors' && request.method() === 'POST') {
			const author = { id: 'author-2', name: 'Octavia Butler' }
			authors = [...authors, author]
			await route.fulfill({ status: 201, json: { author } })
			return
		}

		if (url.pathname === '/api/books') {
			await route.fulfill({ json: { books: [] } })
			return
		}

		const emptyResponses: Record<string, unknown> = {
			'/api/publishers': { publishers: [] },
			'/api/locations': { locations: [] },
			'/api/tags': { tags: [] },
			'/api/languages': { languages: [] },
		}
		await route.fulfill({ json: emptyResponses[url.pathname] ?? {} })
	})

	await page.addInitScript(() => localStorage.setItem('hausmeister_token', 'e2e-token'))
	await page.goto('/library/add')

	const authorSelect = page.locator('details.multi-select').first()
	await authorSelect.locator('summary').click()
	await authorSelect.getByLabel('Search or add author').fill('Octavia Butler')
	await authorSelect.getByRole('button', { name: /Create “Octavia Butler”/ }).click()

	// Inline creation automatically selects the new author and clears the
	// search, which can close the dropdown. Reopen it before checking that the
	// refreshed option remains selectable.
	await expect(authorSelect.getByRole('button', { name: 'Remove Octavia Butler' })).toBeVisible()
	await authorSelect.locator('summary').click()
	const createdAuthor = authorSelect.getByRole('checkbox', { name: 'Octavia Butler' })
	await expect(createdAuthor).toBeChecked()
	await createdAuthor.uncheck()
	await createdAuthor.check()
	await expect(createdAuthor).toBeChecked()
})
