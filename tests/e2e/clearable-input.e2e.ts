import { expect, test } from '@playwright/test'
import { openAddBookPage } from './helpers/author-creation'

test('x clears on a single real click without jumping', async ({ page }) => {
	await openAddBookPage(page)
	const price = page.locator('#provenance-price-add-book-acquisition-grid')
	const party = page.locator('#provenance-party-add-book-acquisition-grid')
	await price.click()
	await price.pressSequentially('12.5')
	await party.click()
	await party.pressSequentially('Bookstore')

	for (const id of [
		'#provenance-price-add-book-acquisition-grid',
		'#provenance-party-add-book-acquisition-grid',
	]) {
		const input = page.locator(id)
		const btn = page.locator(`span.clearable-input:has(${id}) button.input-clear`)
		await btn.scrollIntoViewIfNeeded()
		await input.evaluate((el) => (el as HTMLInputElement).blur())
		const box = await btn.boundingBox()
		if (!box) throw new Error(`no box for ${id}`)
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
		await page.mouse.down()
		await page.waitForTimeout(150)
		const pressed = await btn.boundingBox()
		console.log(`${id} rest-y=${Math.round(box.y)} pressed-y=${Math.round(pressed?.y ?? -1)}`)
		expect(Math.abs((pressed?.y ?? 0) - box.y)).toBeLessThan(2)
		await page.mouse.up()
		await expect(input).toHaveValue('', { timeout: 2000 })
		await expect(input).toBeFocused()
	}
})
