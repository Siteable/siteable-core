import { test, expect, type Locator } from '@playwright/test'
import { exportedHtml, openExportedPage } from './exported-page'
import {
  BOX,
  BUTTON,
  CARD,
  SCOPE,
  assertTapTarget,
  expectFourByThree,
  imagePageHtml,
  pressedCount,
  stubImages,
  visibleCardNames,
  withScriptlessPage,
} from './card-grid-assertions'

/**
 * Real-browser checks for the product card grid and its opt-in category filter.
 *
 * Three claims need a layout engine and cannot be made honestly in a DOM
 * emulation: that a filter row wraps inside a phone-width viewport without a
 * horizontal scrollbar and still gives every button a tappable box, that the
 * card image box keeps its 4:3 ratio when scripting is off, and that a visitor
 * can filter with Enter and Space and can reach every button with Tab.
 *
 * The ratio and the cover fit are inline on purpose, so the script-disabled
 * scenarios are the ones that prove they do not depend on the late-loading
 * stylesheet.
 */

test.describe('a filter row at phone width', () => {
  // Explicit, not inherited from the config: this is a 390 px claim.
  test.use({ viewport: { width: 390, height: 844 } })

  test('nine buttons wrap and stay tappable without a horizontal scrollbar', async ({ page }) => {
    await openExportedPage(page, 'card-grid-many-categories')
    const buttons = page.locator(BUTTON)
    await expect(buttons, 'the "All" button plus eight categories').toHaveCount(9)
    const total = await buttons.count()

    const rows = new Set<number>()
    for (let index = 0; index < total; index += 1) {
      const button = buttons.nth(index)
      await expect(button, `button ${index} must be visible`).toBeVisible()
      await assertTapTarget(button)
      const box = await button.boundingBox()
      rows.add(Math.round(box!.y))
    }
    expect(rows.size, 'the buttons must wrap onto at least two rows').toBeGreaterThanOrEqual(2)

    // clientWidth (not innerWidth) excludes the vertical scrollbar, so a classic
    // scrollbar cannot absorb real horizontal overflow on this assertion.
    const width = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(width.document, 'the document must not scroll sideways').toBeLessThanOrEqual(
      width.client,
    )
    expect(width.body, 'the body must not scroll sideways').toBeLessThanOrEqual(width.client)
  })
})

test.describe('a visitor without scripting', () => {
  test('the buttons are gone and every card keeps its 4:3 image box', async ({ browser }) => {
    await withScriptlessPage(browser, exportedHtml('card-grid-filter'), async (page) => {
      const buttons = page.locator(BUTTON)
      await expect(buttons, 'one "All" button plus three categories').toHaveCount(4)
      for (let index = 0; index < (await buttons.count()); index += 1) {
        const button = buttons.nth(index)
        await expect(button, `button ${index} must be hidden`).toBeHidden()
        expect(await button.evaluate((el) => getComputedStyle(el).display)).toBe('none')
      }

      const cards = page.locator(CARD)
      await expect(cards, 'every product stays on the page').toHaveCount(5)
      for (let index = 0; index < (await cards.count()); index += 1) {
        const card = cards.nth(index)
        await expect(card, `card ${index} must be visible`).toBeVisible()
        expect(await card.evaluate((el) => getComputedStyle(el).display)).not.toBe('none')
        const height = await card.evaluate((el) => el.getBoundingClientRect().height)
        expect(height, `card ${index} must keep a real height`).toBeGreaterThan(0)
      }

      const boxes = page.locator(BOX)
      await expect(boxes).toHaveCount(5)
      for (let index = 0; index < 5; index += 1) {
        const box = await boxes.nth(index).boundingBox()
        expect(box, `image box ${index} must have a real size`).not.toBeNull()
        expectFourByThree(box!, `image box ${index}`)
      }
    })
  })

  test('an image loads, fills its 4:3 box and computes cover fit', async ({ browser }) => {
    await withScriptlessPage(
      browser,
      imagePageHtml(),
      async (page) => {
        const image = page.locator('article img')
        await expect(image, 'the allowed image must render').toHaveCount(1)
        expect(await image.evaluate((el) => getComputedStyle(el).objectFit)).toBe('cover')

        // The routed pixel must actually decode, or this scenario would pass on a
        // card whose image never loaded.
        await expect
          .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
            message: 'the stubbed image must decode',
          })
          .toBeGreaterThan(0)

        const box = await page.locator(BOX).first().boundingBox()
        expect(box, 'the image box must have a real size').not.toBeNull()
        expectFourByThree(box!, 'the image box')

        const rendered = await image.boundingBox()
        expect(rendered!.width, 'the image must fill the box width').toBeCloseTo(box!.width, 0)
        expect(rendered!.height, 'the image must fill the box height').toBeCloseTo(box!.height, 0)
      },
      stubImages,
    )
  })
})

test.describe('a visitor using the filter buttons', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Enter and Space filter, one button per grid stays pressed, Tab reaches all', async ({
    page,
  }) => {
    await openExportedPage(page, 'card-grid-filter')
    const scope = page.locator(SCOPE)
    await expect(scope, 'one filter scope').toHaveCount(1)
    const total = await page.locator(BUTTON).count()
    expect(total, 'All plus three categories').toBe(4)
    await expect(page.getByRole('button', { name: 'All', pressed: true })).toHaveCount(1)
    expect(await visibleCardNames(page)).toHaveLength(5)

    // Enter on a category: only that category's cards stay, and only its button
    // is pressed.
    await page.getByRole('button', { name: 'Hats' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Hats', pressed: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'All', pressed: true })).toHaveCount(0)
    expect(await pressedCount(page), 'exactly one pressed button').toBe(1)
    expect(await visibleCardNames(page)).toEqual(['Cap'])

    // Space on another category moves the filter without losing the invariant.
    await page.getByRole('button', { name: 'Bags' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Bags', pressed: true })).toHaveCount(1)
    expect(await pressedCount(page), 'exactly one pressed button').toBe(1)
    expect(await visibleCardNames(page)).toEqual(['Tote'])

    // "All" brings back every card, the uncategorised one included.
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByRole('button', { name: 'All', pressed: true })).toHaveCount(1)
    expect(await visibleCardNames(page)).toHaveLength(5)

    // Tab order: every filter button is reachable from a cleared focus. Chromium
    // parks the first Tab on the document body in this headless lane, so a
    // non-button stop is skipped rather than treated as the end of the run.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const reached = new Set<string>()
    for (let step = 0; step < 12 && reached.size < total; step += 1) {
      await page.keyboard.press('Tab')
      const key = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        return active?.hasAttribute('data-sb-filter-btn')
          ? (active.getAttribute('data-sb-filter-btn') ?? '')
          : null
      })
      if (key !== null) reached.add(key)
    }
    expect(Array.from(reached).sort()).toEqual(['', 'bags', 'hats', 'shoes'])
  })

  test('two grids on one page filter independently, one pressed button each', async ({ page }) => {
    await openExportedPage(page, 'two-card-grids')
    const scopes = page.locator(SCOPE)
    await expect(scopes, 'two filter grids').toHaveCount(2)
    const visibleCards = (scope: Locator) => scope.locator('article:visible').count()

    await scopes.nth(1).getByRole('button', { name: 'Shoes' }).click()

    for (let index = 0; index < 2; index += 1) {
      expect(
        await pressedCount(scopes.nth(index)),
        `grid ${index} must report exactly one pressed button`,
      ).toBe(1)
    }
    // The untouched grid keeps its "All" state and every card; the filtered one
    // now shows only its own matching cards.
    await expect(scopes.nth(0).getByRole('button', { name: 'All', pressed: true })).toHaveCount(1)
    await expect(scopes.nth(1).getByRole('button', { name: 'Shoes', pressed: true })).toHaveCount(1)
    expect(await visibleCards(scopes.nth(0))).toBe(3)
    expect(await visibleCards(scopes.nth(1))).toBe(2)
  })
})
