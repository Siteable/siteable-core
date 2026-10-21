import { expect, type Browser, type Locator, type Page } from '@playwright/test'
import type { BlockConfig } from '../../src/blocks/types'
import { exportSiteToHTML } from '../../src/lib/export-html'

/**
 * Shared observation helpers for the product card grid browser lane.
 *
 * The scenarios and their expectations stay in `card-grid-checks.spec.ts`, so a
 * failure still names the behavior. This module owns the selectors, the pure
 * observations, the context wrapper, and ONE bespoke document: every shared
 * fixture has no image, so the cover-fit claim needs a card that carries one.
 * This mirrors `carousel-assertions.ts`.
 */

export const SCOPE = '[data-sb-filter]'
export const BUTTON = 'button[data-sb-filter-btn]'
// Scoped to the filter container: another block could start emitting <article>
// without silently widening these counts.
export const CARD = `${SCOPE} article`
export const BOX = 'article > div[style*="aspect-ratio"]'

/** The minimum tappable box, in CSS pixels. */
export const TAP_TARGET = 32

/** A 1x1 transparent PNG, so an image scenario never touches the network. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** Serve every image request from memory instead of the network. */
export async function stubImages(page: Page): Promise<void> {
  await page.route('https://images.example.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
}

/**
 * One card with an allowed image, in a plain grid. The shared fixture set
 * carries no image (an empty source renders the placeholder), so the cover-fit
 * claim needs a document of its own rather than a new shared fixture. No
 * `display` key, which keeps the grid on the plain path.
 */
const imageBlock: BlockConfig = {
  id: 'cg-image',
  type: 'card-grid',
  variant: 'product',
  props: {
    title: 'Products',
    items: [{ name: 'Runner', image: 'https://images.example.test/runner.png', category: 'Shoes' }],
  },
}

/** Exported markup for one card that carries an allowed image. */
export function imagePageHtml(): string {
  return exportSiteToHTML({ name: 'Site', blocks: [imageBlock] })
}

/** A page or a subtree of one: the same observations apply to both. */
type Root = Page | Locator

/** The card names that are actually shown, in document order. */
export function visibleCardNames(root: Root): Promise<string[]> {
  return root.locator('article:visible h3').allTextContents()
}

/** How many buttons claim the pressed state within `root`. */
export function pressedCount(root: Root): Promise<number> {
  return root.locator('[aria-pressed="true"]').count()
}

/**
 * Load `html` with scripting disabled and hand the page to `run`, always
 * closing the context. The no-script condition is the point: with no script the
 * style script never runs, so only the inline geometry survives.
 */
export async function withScriptlessPage(
  browser: Browser,
  html: string,
  run: (page: Page) => Promise<void>,
  prepare: (page: Page) => Promise<void> = async () => {},
): Promise<void> {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  try {
    await prepare(page)
    await page.setContent(html, { waitUntil: 'load' })
    await run(page)
  } finally {
    // A failing assertion must not leak the context to the rest of the worker.
    await context.close()
  }
}

/** A 4:3 box holds its ratio to within one pixel, and is not empty. */
export function expectFourByThree(box: { width: number; height: number }, what: string): void {
  expect(box.width, `${what} must have a real width`).toBeGreaterThan(0)
  expect(Math.abs(box.height - (box.width * 3) / 4), `${what} must keep the 4:3 ratio`)
    .toBeLessThanOrEqual(1)
}

/**
 * Wait for the style script to have applied the tap-target utilities, then
 * measure the box. The CDN stylesheet can land just after `load`, so measuring
 * before it does would report a false failure (the same race
 * `carousel-assertions.ts` guards). The size constant lives here, once.
 */
export async function assertTapTarget(button: Locator): Promise<void> {
  await expect(button, 'min-height utility must apply').toHaveCSS(
    'min-height',
    `${TAP_TARGET}px`,
  )
  await expect(button, 'min-width utility must apply').toHaveCSS('min-width', `${TAP_TARGET}px`)
  const box = await button.boundingBox()
  expect(box, 'the button must render a measurable box').not.toBeNull()
  expect(box!.width, 'button width at 390px').toBeGreaterThanOrEqual(TAP_TARGET)
  expect(box!.height, 'button height at 390px').toBeGreaterThanOrEqual(TAP_TARGET)
}
