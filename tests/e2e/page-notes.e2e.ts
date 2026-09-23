import { expect, test } from '@playwright/test'
import { openAddBookPage } from './helpers/author-creation'

test('dedication inputs keep focus while typing', async ({ page }) => {
	await openAddBookPage(page)

	await page.getByRole('button', { name: 'Add dedication' }).click()
	const textInput = page.getByLabel('dedication 1 text')
	await textInput.click()
	await textInput.pressSequentially('For Anna', { delay: 20 })

	expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
		'dedication 1 text',
	)
	expect(await textInput.inputValue()).toBe('For Anna')

	// Page field of the same row.
	const pageInput = page.getByLabel('dedication 1 page')
	await pageInput.click()
	await pageInput.pressSequentially('flyleaf', { delay: 20 })
	expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
		'dedication 1 page',
	)
	expect(await pageInput.inputValue()).toBe('flyleaf')

	// Second row, then remove the first; values must follow their rows.
	await page.getByRole('button', { name: 'Add dedication' }).click()
	await page.getByLabel('dedication 2 text').fill('Second entry')
	await page.getByRole('button', { name: 'Remove dedication 1' }).click()
	expect(await page.getByLabel('dedication 1 text').inputValue()).toBe('Second entry')
	expect(await page.getByLabel('dedication 2 text').count()).toBe(0)

	// Damages editor behaves the same.
	await page.getByRole('button', { name: 'Add damage' }).click()
	const damageInput = page.getByLabel('damage 1 text')
	await damageInput.click()
	await damageInput.pressSequentially('Torn jacket', { delay: 20 })
	expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe(
		'damage 1 text',
	)
	expect(await damageInput.inputValue()).toBe('Torn jacket')
})
