import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/sach-battleship/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    restoreMocks: true,
  },
})
