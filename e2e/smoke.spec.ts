import { expect, test } from '@playwright/test'

test('production app supports a complete smoke flow under its Pages base path', async ({ page }) => {
  const browserErrors: string[] = []
  const responseStatuses = new Map<string, number>()

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => responseStatuses.set(response.url(), response.status()))

  await page.goto('./')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Battleship' })).toBeVisible()

  const assetUrls = await page.locator('script[src], link[href]').evaluateAll((elements) =>
    elements.map((element) => {
      if (element instanceof HTMLScriptElement) return element.src
      return (element as HTMLLinkElement).href
    }),
  )
  expect(assetUrls.length).toBeGreaterThan(0)
  for (const assetUrl of assetUrls) {
    expect(new URL(assetUrl).pathname).toMatch(/^\/sach-battleship\//)
    const responseStatus = responseStatuses.get(assetUrl) ?? (await page.request.get(assetUrl)).status()
    expect(responseStatus, assetUrl).toBe(200)
  }

  await page.getByRole('button', { name: 'Randomize' }).click()
  await page.getByRole('button', { name: 'Start game' }).click()
  const enemyGrid = page.getByRole('grid', { name: 'Enemy waters' })
  const playerGrid = page.getByRole('grid', { name: 'Your fleet' })
  const status = page.getByRole('status')
  const timer = page.getByRole('timer')
  await expect(timer).toContainText('Seconds left to fire')

  for (let shot = 1; shot <= 3; shot += 1) {
    await enemyGrid.getByRole('gridcell', { name: /untried$/ }).first().click()
    const thinking = page.getByText('AI is thinking...', { exact: true })
    await expect(thinking).toBeVisible()
    await expect(timer).toContainText('AI fires in')
    await expect(thinking).toBeHidden({ timeout: 10_000 })
    await expect(status).toContainText('AI fired at')
    await expect(playerGrid.locator(
      '[data-state="miss"], [data-state="hit"], [data-state="sunk"]',
    )).toHaveCount(shot)
  }

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Battleship' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start game' })).toBeDisabled()

  await page.setViewportSize({ width: 320, height: 800 })
  const documentWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.clientWidth)
  expect(browserErrors).toEqual([])
})
