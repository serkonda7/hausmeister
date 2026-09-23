import { expect, test } from '@playwright/test'
import { createAuthor, openAddBookPage } from './helpers/author-creation'

// Representative coverage for `MultiSelect` component, exercised through the author field.
test('automatically selects an author created inline', async ({ page }) => {
	await openAddBookPage(page)
	const authorSelect = await createAuthor(page)

	await expect(authorSelect.getByRole('button', { name: 'Remove Octavia Butler' })).toBeVisible()
})

// Representative coverage for `MultiSelect` component, exercised through the author field.
test('keeps an inline-created author selectable after the dropdown refreshes', async ({ page }) => {
	await openAddBookPage(page)
	const authorSelect = await createAuthor(page)

	// Creation clears the search and may close the dropdown; reopen it to
	// verify that the refreshed option remains available and toggleable.
	await authorSelect.locator('summary').click()
	const createdAuthor = authorSelect.getByRole('checkbox', { name: 'Octavia Butler' })
	await expect(createdAuthor).toBeChecked()
	await createdAuthor.uncheck()
	await createdAuthor.check()
	await expect(createdAuthor).toBeChecked()
})

test('selects a searched author with Enter after tabbing from the search field', async ({
	page,
}) => {
	await openAddBookPage(page)
	const authorSelect = page.locator('details.multi-select').first()
	await authorSelect.locator('summary').click()

	const search = authorSelect.getByLabel('Search or add author')
	await search.fill('Ursula')
	const author = authorSelect.getByRole('checkbox', { name: 'Ursula Le Guin' })
	await search.press('Tab')
	await expect(author).toBeFocused()
	await author.press('Enter')

	await expect(author).toBeChecked()
	await expect(authorSelect.getByRole('button', { name: 'Remove Ursula Le Guin' })).toBeVisible()
})
