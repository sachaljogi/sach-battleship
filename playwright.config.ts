import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173/sach-battleship/',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/sach-battleship/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
