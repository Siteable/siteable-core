import { test, expect, type Page } from '@playwright/test'
import { buildEditorBundle } from './editor-bundle'
import { makeFiftyItems } from '../helpers/card-grid-items-fixtures'

/**
 * Interaction timing for the card grid items editor with 50 items, measured in
 * real Chromium against a production build of the editor. Each figure is the
 * median of five runs: time from the DOM event until two animation frames
 * later (React commit plus paint). The figures are reported (console and test
 * annotations) but never asserted, so a slow shared runner cannot fail the suite.
 */
const RUNS = 5
let bundle = ''

test.beforeAll(async () => {
  bundle = await buildEditorBundle('tests/browser/editor-harness/card-grid-items-editor-harness.tsx')
})

async function mount(page: Page) {
  await page.setContent('<div id="root"></div>')
  await page.addScriptTag({ type: 'module', content: bundle })
  await expect(page.locator('[data-card-grid-item]')).toHaveCount(50)
}

/** Runs `action` in the page and resolves with the elapsed ms until paint. */
async function measureOnce(page: Page, action: string): Promise<number> {
  return page.evaluate(async (src) => {
    const run = new Function(`return (${src})`)() as () => void
    const raf = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    const start = performance.now()
    run()
    await raf()
    await raf()
    return performance.now() - start
  }, action)
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function medianOf(page: Page, name: string, action: (i: number) => string): Promise<number> {
  const samples: number[] = []
  for (let i = 0; i < RUNS; i++) samples.push(await measureOnce(page, action(i)))
  const m = median(samples)
  console.log(`[timing] ${name}: median ${m.toFixed(1)} ms (samples ${samples.map((s) => s.toFixed(1)).join(', ')})`)
  test.info().annotations.push({ type: 'timing', description: `${name}: median ${m.toFixed(1)} ms` })
  return m
}

test('search keystroke on 50 items completes and reports its timing', async ({ page }) => {
  await mount(page)
  const m = await medianOf(
    page,
    'search',
    (i) => `() => {
      const input = document.querySelector('input[type="search"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(input, ${JSON.stringify(i % 2 === 0 ? 'Runner 1' : '')});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }`,
  )
  expect(Number.isFinite(m)).toBe(true)
  // The last run typed a query, so the list really was filtered.
  expect(await page.locator('[data-card-grid-item]').count()).toBeLessThan(50)
})

test('reorder (Move down on row 1) on 50 items completes and reports its timing', async ({ page }) => {
  await mount(page)
  const m = await medianOf(
    page,
    'reorder',
    () => `() => document.querySelector('[data-card-grid-item] button[aria-label="Move down"]').click()`,
  )
  expect(Number.isFinite(m)).toBe(true)
  await expect(page.locator('[data-card-grid-item]')).toHaveCount(50)
})

test('group toggle on 50 items completes and reports its timing', async ({ page }) => {
  await mount(page)
  const m = await medianOf(
    page,
    'group',
    () => `() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('Group by category'));
      b.click();
    }`,
  )
  expect(Number.isFinite(m)).toBe(true)
  // Five toggles end in the grouped state.
  await expect(page.locator('[data-card-grid-group]').first()).toBeVisible()
})

test('thumbnails are lazy: one lazy image per item with an allowed image', async ({ page }) => {
  await mount(page)
  const withImage = makeFiftyItems().filter((it) => typeof it.image === 'string').length
  expect(withImage).toBeGreaterThan(0)
  await expect(page.locator('[data-card-grid-item] img[loading="lazy"]')).toHaveCount(withImage)
  await expect(page.locator('[data-card-grid-item] img:not([loading="lazy"])')).toHaveCount(0)
})
