import { expect, type Browser, type Locator } from '@playwright/test'
import { exportedHtml } from './exported-page'
import type { Fixture } from '../helpers/behavior-fixtures'

/**
 * Shared assertions for the opt-in carousel browser lane.
 *
 * Only the observation code lives here; the scenarios and their fixture-specific
 * expectations stay in `carousel-checks.spec.ts`, so a failure still names the
 * behavior. This mirrors the existing `exported-page.ts` harness helper.
 */

export const REGION = '[role="region"][aria-roledescription="carousel"]'
export const SLIDE = '[data-sb-carousel-slide]'
export const PREV = 'button[aria-label="Previous slide"]'
export const NEXT = 'button[aria-label="Next slide"]'
export const CONTROLS = `${PREV}, ${NEXT}`

// The no-script rules are pinned as literals on purpose: reading them from the
// module under test would let a regression move both sides of the comparison.
export const CONTROLS_HIDDEN = '[data-sb-carousel-prev],[data-sb-carousel-next]{display:none!important}'
export const SLIDES_SHOWN = '[data-sb-carousel-slide]{display:block!important}'

export interface Expected {
  title: string
  /** One distinctive marker per item, in item order, to catch a misindexed slide. */
  markers: string[]
}

/** Both controls are big enough to tap and ask for the 40 px utilities. */
export async function assertControlSize(region: Locator): Promise<void> {
  const pair = [['previous', region.locator(PREV)], ['next', region.locator(NEXT)]] as const
  for (const [name, control] of pair) {
    await expect(control, `${name} control must be visible`).toBeVisible()
    // Auto-retrying: the CDN-injected stylesheet can land just after `load`.
    await expect(control, `${name} control min-height`).toHaveCSS('min-height', '40px')
    await expect(control, `${name} control min-width`).toHaveCSS('min-width', '40px')
    const box = await control.boundingBox()
    expect(box, `${name} control must render a measurable box`).not.toBeNull()
    expect(box!.width, `${name} control width at 390px`).toBeGreaterThanOrEqual(32)
    expect(box!.height, `${name} control height at 390px`).toBeGreaterThanOrEqual(32)
  }
}

/** Exactly one slide is shown, and it is the one at `shown`. */
export async function assertOnlySlide(region: Locator, shown: number, total: number): Promise<void> {
  const slides = region.locator(SLIDE)
  await expect(slides).toHaveCount(total)
  for (let i = 0; i < total; i += 1) {
    if (i === shown) await expect(slides.nth(i), `slide ${i} must be the visible one`).toBeVisible()
    else await expect(slides.nth(i), `slide ${i} must be hidden`).toBeHidden()
  }
}

/**
 * The script-disabled contract: both controls gone, every slide a plain visible
 * block in item order, and the non-first slides still carrying `hidden` — so the
 * `!important` declaration is proven to beat the user agent rule rather than the
 * markup simply dropping the state.
 */
export async function assertNoScriptStack(
  browser: Browser,
  fixture: Fixture,
  regions: Expected[],
): Promise<void> {
  const html = exportedHtml(fixture)
  expect(html, 'the controls must be dropped without script').toContain(CONTROLS_HIDDEN)
  expect(html, 'the slides must be shown without script').toContain(SLIDES_SHOWN)
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load' })

    await expect(page.locator(REGION)).toHaveCount(regions.length)
    const controls = page.locator(CONTROLS)
    await expect(controls).toHaveCount(regions.length * 2)
    for (let i = 0; i < (await controls.count()); i += 1) {
      await expect(controls.nth(i), `control ${i} must be hidden`).toBeHidden()
      expect(await controls.nth(i).evaluate((el) => getComputedStyle(el).display)).toBe('none')
    }

    // The first index of each region, so "non-first slide" survives two regions.
    const expected = regions.flatMap((region) => region.markers)
    const firsts = new Set<number>()
    for (let offset = 0, i = 0; i < regions.length; i += 1) {
      firsts.add(offset)
      offset += regions[i].markers.length
    }

    const slides = page.locator(SLIDE)
    await expect(slides).toHaveCount(expected.length)
    const texts = await slides.allTextContents()
    for (let i = 0; i < expected.length; i += 1) {
      const slide = slides.nth(i)
      if (!firsts.has(i)) {
        const carried = await slide.evaluate((el) => el.hasAttribute('hidden'))
        expect(carried, `slide ${i} must still carry the hidden state`).toBe(true)
      }
      await expect(slide, `slide ${i} must be visible without script`).toBeVisible()
      expect(await slide.evaluate((el) => getComputedStyle(el).display)).not.toBe('none')
      const box = await slide.boundingBox()
      expect(box?.height, `slide ${i} must have real height`).toBeGreaterThan(0)
      // DOM order is item order: slide i renders item i.
      expect(texts[i], `slide ${i} must render item ${i}`).toContain(expected[i])
    }
  } finally {
    // A failing assertion must not leak the context to the rest of the worker.
    await context.close()
  }
}
