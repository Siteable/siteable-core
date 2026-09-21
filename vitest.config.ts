import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Vitest config — mirrors the private repo's setup (jsdom + localStorage polyfill).
 * The setup file rebinds `globalThis.localStorage` to an in-memory Storage to
 * dodge the Node ≥22 experimental accessor that shadows jsdom's. See
 * ISS-003 + tests/setup/local-storage-polyfill.ts for the gotcha.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup/local-storage-polyfill.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
