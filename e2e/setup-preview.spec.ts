import { expect, test } from '@playwright/test'

test('placement preview clears when the mouse leaves the board after a click', async ({ page }) => {
  await page.goto('./')
  const fleetGrid = page.getByRole('grid', { name: 'Your fleet' })
  const previewMessage = page.locator('.preview-message')
  const idleMessage = 'Hover over or focus a cell to preview placement.'
  const cell = (label: string) => fleetGrid.getByRole('gridcell', { name: new RegExp(`^Your fleet, ${label},`) })

  await cell('A1').hover()
  await expect(previewMessage).toHaveText('Carrier at A1, horizontal: fits')
  await expect(fleetGrid.locator('.preview-valid')).toHaveCount(5)

  await cell('A1').click()
  await expect(page.getByRole('button', { name: /Carrier, length 5 — Placed/ })).toBeVisible()
  await expect(cell('A1')).toBeFocused()
  await expect(previewMessage).toHaveText(idleMessage)
  await expect(fleetGrid.locator('.preview-invalid')).toHaveCount(0)

  await page.getByRole('heading', { name: 'Battleship' }).hover()
  await expect(previewMessage).toHaveText(idleMessage)
  await expect(fleetGrid.locator('.preview-valid, .preview-invalid')).toHaveCount(0)

  await cell('A1').focus()
  await page.keyboard.press('ArrowDown')
  await expect(cell('A2')).toBeFocused()
  await expect(previewMessage).toHaveText('Battleship at A2, horizontal: fits')
  await page.getByRole('heading', { name: 'Battleship' }).hover()
  await expect(previewMessage).toHaveText('Battleship at A2, horizontal: fits')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /Battleship, length 4 — Placed/ })).toBeVisible()
  await expect(previewMessage).toHaveText(idleMessage)
  await expect(fleetGrid.locator('.preview-invalid')).toHaveCount(0)
})
