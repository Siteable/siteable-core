import { defineConfig } from '@playwright/test'

/**
 * Browser lane for checks that a DOM-emulation test cannot make honestly:
 * real layout, real computed CSS, the accessibility tree, and script-disabled
 * rendering. The unit suite stays on vitest + jsdom; nothing here is picked up
 * by `npm test` (the files are `*.spec.ts`, the vitest glob is `*.test.*`).
 */
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    viewport: { width: 390, height: 844 },
    // A failing run in CI keeps a trace for the retry so the failure is
    // diagnosable without re-running the job; local runs stay lightweight.
    trace: process.env.CI ? 'on-first-retry' : 'off',
    video: 'off',
    screenshot: 'off',
  },
})
