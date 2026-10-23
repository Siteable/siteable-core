import { test, expect, type Page } from '@playwright/test'
import { buildEditorBundle } from './editor-bundle'

/**
 * Bulk add of 30 picked images into a card grid that already holds 500 products,
 * in real Chromium against a production build of the editor, through the real
 * path (button click, pick engine, append, one store write). Every measured run
 * must write the store exactly once, end with 530 rows, and leave the first 500
 * entries as the very same objects. The two time figures (hook result handed over
 * until the store changed, and until the second animation frame after that) are
 * bounded by a coarse backstop on the slowest of the measured runs; one warm-up
 * run is not measured.
 */
const RUNS = Number(process.env.BULK_TIMING_RUNS ?? 5)
const BACKSTOP_MS = 100
let bundle = ''

test.beforeAll(async () => {
  bundle = await buildEditorBundle('tests/browser/editor-harness/card-grid-bulk-add-harness.tsx')
})

interface Sample { storeMs: number; paintMs: number; notifications: number; rows: number; same: boolean }

type BulkApi = {
  snapshot(): void
  resolve(): void
  read(): { storeMs: number | null; paintMs: number | null; notifications: number; rows: number }
  sameFirst500(): boolean
  undo(): void
}
declare global { interface Window { __bulk: BulkApi } }

async function oneRun(page: Page): Promise<Sample> {
  await page.evaluate(() => window.__bulk.snapshot())
  await page.locator('[data-bulk-image-pick]').click()
  await page.evaluate(() => window.__bulk.resolve())
  await expect(page.locator('[data-card-grid-item]')).toHaveCount(530)
  await page.waitForFunction(() => window.__bulk.read().paintMs !== null)
  const read = await page.evaluate(() => ({ ...window.__bulk.read(), same: window.__bulk.sameFirst500() }))
  const sample = { storeMs: read.storeMs!, paintMs: read.paintMs!, notifications: read.notifications, rows: read.rows, same: read.same }
  await page.evaluate(() => window.__bulk.undo())
  await expect(page.locator('[data-card-grid-item]')).toHaveCount(500)
  expect((await page.evaluate(() => window.__bulk.read())).notifications).toBe(0)
  return sample
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return { min: sorted[0], median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] }
}

test('adding 30 images to 500 products writes once, keeps the old entries and stays within the backstop', async ({ page }) => {
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ type: 'module', content: bundle })
  await expect(page.locator('[data-card-grid-item]')).toHaveCount(500)

  await oneRun(page) // warm-up, not measured
  const samples: Sample[] = []
  for (let i = 0; i < RUNS; i++) samples.push(await oneRun(page))

  for (const s of samples) {
    expect(s.notifications).toBe(1)
    expect(s.rows).toBe(530)
    expect(s.same).toBe(true)
  }
  const store = stats(samples.map((s) => s.storeMs))
  const paint = stats(samples.map((s) => s.paintMs))
  const fmt = (x: { min: number; median: number; max: number }) => `min ${x.min.toFixed(1)} / median ${x.median.toFixed(1)} / max ${x.max.toFixed(1)} ms`
  console.log(`[timing] bulk add store ${fmt(store)}; paint ${fmt(paint)}; runs ${RUNS}`)
  console.log(`[timing] bulk add samples store ${samples.map((s) => s.storeMs.toFixed(1)).join(', ')}; paint ${samples.map((s) => s.paintMs.toFixed(1)).join(', ')}`)
  test.info().annotations.push({ type: 'timing', description: `store ${fmt(store)}; paint ${fmt(paint)}` })

  if (RUNS === 5) {
    expect(store.max).toBeLessThanOrEqual(BACKSTOP_MS)
    expect(paint.max).toBeLessThanOrEqual(BACKSTOP_MS)
  }
})
