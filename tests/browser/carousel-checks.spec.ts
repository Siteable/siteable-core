import { test, expect } from '@playwright/test'
import { exportedHtml, openExportedPage } from './exported-page'
import {
  NEXT,
  PREV,
  REGION,
  SLIDE,
  assertControlSize,
  assertNoScriptStack,
  assertOnlySlide,
  type Expected,
} from './carousel-assertions'

/**
 * Real-browser checks for the opt-in carousel layout.
 *
 * Everything here needs a real layout engine: control sizes, the accessibility
 * tree, and the script-disabled stylesheet (the user agent's `[hidden]` rule
 * versus the `!important` no-script declaration). A DOM-emulation test cannot
 * make those claims honestly, so they are not duplicated there.
 */

const STORIES: Expected = { title: 'Customer stories', markers: ['Quote 1', 'Quote 2', 'Quote 3'] }
const GALLERY: Expected = { title: 'Gallery picks', markers: ['Caption 1', 'Caption 2', 'Caption 3', 'Caption 4'] }
const SHARED: Expected = { title: 'Gallery picks', markers: ['Caption 1', 'Caption 2', 'Caption 3'] }

test.describe('carousel on a phone-width viewport', () => {
  // Explicit, not inherited from the config: this is a 390 px claim.
  test.use({ viewport: { width: 390, height: 844 } })

  test('tap targets, one visible slide at a time and keyboard movement', async ({ page }) => {
    await openExportedPage(page, 'carousel-testimonials')
    const region = page.getByRole('region', { name: STORIES.title })
    await expect(region).toHaveCount(1)
    await assertControlSize(region)
    await assertOnlySlide(region, 0, STORIES.markers.length)

    const prev = region.locator(PREV)
    const next = region.locator(NEXT)
    await expect(prev).toBeDisabled()
    await expect(next).toBeEnabled()
    await next.click()
    await assertOnlySlide(region, 1, STORIES.markers.length)
    await expect(prev).toBeEnabled()
    await next.click()
    await assertOnlySlide(region, 2, STORIES.markers.length)
    await expect(next).toBeDisabled()
    await page.keyboard.press('ArrowLeft')
    await assertOnlySlide(region, 1, STORIES.markers.length)
    await page.keyboard.press('ArrowRight')
    await assertOnlySlide(region, 2, STORIES.markers.length)
  })

  test('the gallery carousel stays tappable through the whole list', async ({ page }) => {
    await openExportedPage(page, 'carousel-gallery')
    const region = page.getByRole('region', { name: GALLERY.title })
    await expect(region).toHaveCount(1)
    await assertControlSize(region)
    await assertOnlySlide(region, 0, GALLERY.markers.length)
    const prev = region.locator(PREV)
    const next = region.locator(NEXT)
    await expect(prev).toBeDisabled()
    for (let i = 1; i < GALLERY.markers.length; i += 1) {
      await next.click()
      await assertOnlySlide(region, i, GALLERY.markers.length)
    }
    await expect(next).toBeDisabled()
    await expect(prev).toBeEnabled()
  })

  test('nothing moves on its own', async ({ page }) => {
    await openExportedPage(page, 'carousel-testimonials')
    // One-shot samples, never auto-retrying assertions: a retrying
    // `toBeVisible` would eventually observe slide 1 again on an autoplay loop
    // and pass. This samples the shown index for 1.5 s, which catches any timer
    // faster than that; timers of ANY period are forbidden outright by the
    // runtime source scan for setInterval/setTimeout/requestAnimationFrame, so
    // this row does not have to be the total guard on its own.
    const shownIndices = await page.evaluate(async (selector) => {
      const found = new Set<number>()
      const snapshot = () => {
        const slides = Array.from(document.querySelectorAll<HTMLElement>(selector))
        found.add(slides.findIndex((slide) => !slide.hidden))
      }
      snapshot()
      const end = Date.now() + 1500
      while (Date.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        snapshot()
      }
      return Array.from(found).sort()
    }, SLIDE)
    expect(shownIndices, 'with no input the shown slide must never change').toEqual([0])
  })

  for (const preference of ['reduce', 'no-preference'] as const) {
    test(`nothing animates when the visitor prefers ${preference} motion`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: preference })
      await openExportedPage(page, 'carousel-testimonials')

      // Prove the preference really reached the page, so a silently ignored
      // emulation cannot make this row pass for the wrong reason.
      const applied = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      expect(applied, 'the emulated preference must be visible to the page').toBe(preference === 'reduce')

      const region = page.getByRole('region', { name: STORIES.title })
      const next = region.locator(NEXT)

      // Walk the whole list: a slide change that animated would show up as a
      // non-zero duration or a named animation on whatever just appeared.
      for (let index = 0; index < STORIES.markers.length; index += 1) {
        const motion = await region.evaluate((root, selectors) => {
          const targets = [root, ...Array.from(root.querySelectorAll<HTMLElement>(selectors))]
          return targets.map((element) => {
            const style = getComputedStyle(element)
            return {
              tag: element.tagName,
              duration: style.transitionDuration,
              animation: style.animationName,
            }
          })
        }, `${SLIDE}, ${PREV}, ${NEXT}`)
        for (const entry of motion) {
          expect(entry.duration, `${entry.tag} must not transition (step ${index})`).toMatch(/^(0s)(, 0s)*$/)
          expect(entry.animation, `${entry.tag} must not animate (step ${index})`).toBe('none')
        }
        await assertOnlySlide(region, index, STORIES.markers.length)
        if (index < STORIES.markers.length - 1) await next.click()
      }
    })
  }

  test('focus is not dropped when the control in use becomes disabled', async ({ page }) => {
    await openExportedPage(page, 'carousel-testimonials')
    const region = page.getByRole('region', { name: STORIES.title })
    const prev = region.locator(PREV)
    const next = region.locator(NEXT)
    await next.click()
    await next.click()
    await assertOnlySlide(region, 2, STORIES.markers.length)
    await expect(next).toBeDisabled()
    // Disabling the focused control must not send focus to the document body.
    await expect(prev).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await assertOnlySlide(region, 1, STORIES.markers.length)
  })

  test('two carousels on one page move separately', async ({ page }) => {
    await openExportedPage(page, 'two-carousels')
    const stories = page.getByRole('region', { name: STORIES.title })
    const gallery = page.getByRole('region', { name: GALLERY.title })
    await expect(stories).toHaveCount(1)
    await expect(gallery).toHaveCount(1)
    await gallery.locator(NEXT).click()
    await assertOnlySlide(gallery, 1, GALLERY.markers.length)
    await assertOnlySlide(stories, 0, STORIES.markers.length)
    // Keys act only inside the owning carousel: with nothing focused there is
    // no region to scope to, so neither carousel may move.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('ArrowRight')
    await assertOnlySlide(gallery, 1, GALLERY.markers.length)
    await assertOnlySlide(stories, 0, STORIES.markers.length)
  })

  test('two carousels sharing one block id stay independent', async ({ page }) => {
    await openExportedPage(page, 'carousels-shared-id')
    const regions = page.getByRole('region', { name: SHARED.title })
    await expect(regions).toHaveCount(2)
    // Region ids come from a per-document counter, not from the block id: two
    // blocks sharing one block id must still point at two different headings.
    const labelled = await page
      .locator(REGION)
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-labelledby')))
    expect(new Set(labelled).size).toBe(2)
    await regions.nth(1).locator(NEXT).click()
    await assertOnlySlide(regions.nth(1), 1, SHARED.markers.length)
    await assertOnlySlide(regions.nth(0), 0, SHARED.markers.length)
  })
})

test.describe('what assistive technology is told', () => {
  test('region name, slide position and control state', async ({ page }) => {
    await openExportedPage(page, 'carousel-testimonials')
    await expect(page.getByRole('region', { name: STORIES.title })).toHaveCount(1)
    const first = page.getByRole('group', { name: '1 of 3' })
    await expect(first).toHaveCount(1)
    await expect(first).toBeVisible()
    // A role locator that matches nothing is also "hidden", so a missing
    // carousel would satisfy this vacuously. Pin the count AND the raw
    // element's hidden state separately.
    await expect(page.getByRole('group', { name: '2 of 3' })).toHaveCount(0)
    const slides = page.locator(SLIDE)
    await expect(slides).toHaveCount(3)
    await expect(slides.nth(1)).toBeHidden()
    await expect(page.getByRole('button', { name: 'Next slide' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Previous slide' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next slide' }).click()
    await expect(page.getByRole('group', { name: '2 of 3' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous slide' })).toBeEnabled()
  })
})

test.describe('a visitor without scripting', () => {
  test('one carousel renders every slide stacked in item order', async ({ browser }) => {
    await assertNoScriptStack(browser, 'carousel-testimonials', [STORIES])
  })

  // Deliberately the MIXED fixture with UNEQUAL regions (3 testimonials + 4
  // gallery): equal-length regions would hide an offset-accumulation bug, and a
  // mixed page proves the loop is not assuming one item template either.
  test('two carousels render every slide stacked in item order', async ({ browser }) => {
    await assertNoScriptStack(browser, 'two-carousels', [STORIES, GALLERY])
  })
})

// The rule literals are written out HERE as well, verbatim, and asserted against
// the exported bytes: the phase's own rule is that the spec hard-codes them, so a
// change to the emitter cannot move both sides of this pin. (The helper keeps its
// own copy for the no-script scenarios.)
test('both no-script rule literals are emitted on a carousel page', async () => {
  const html = exportedHtml('carousel-testimonials')
  expect(html).toContain('[data-sb-carousel-prev],[data-sb-carousel-next]{display:none!important}')
  expect(html).toContain('[data-sb-carousel-slide]{display:block!important}')
})
