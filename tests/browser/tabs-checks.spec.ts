import { test, expect, type Browser, type Page } from '@playwright/test'
import { exportedHtml, openExportedPage } from './exported-page'
import type { Fixture } from '../helpers/behavior-fixtures'

/**
 * Real-browser checks for the opt-in tabs layout.
 *
 * Everything here needs a real layout engine: tap-target sizes, the
 * accessibility tree, and the script-disabled stylesheet (the user agent's
 * `[hidden]` rule versus the `!important` no-script declaration). A jsdom test
 * cannot make those claims honestly, so they are not duplicated there.
 */

const TABLIST = '[data-sb-tablist]'
const TAB = '[data-sb-tab]'
const PANEL = '[data-sb-tab-panel]'
const TITLES = ['First feature', 'Second feature', 'Third feature']
const DESCRIPTIONS = ['First description.', 'Second description.', 'Third description.']

/**
 * The no-script rules are pinned as literals on purpose: reading the expected
 * value from the module under test would let a regression move both sides.
 */
const TABLIST_HIDDEN = '[data-sb-tablist]{display:none!important}'
const PANELS_SHOWN = '[data-sb-tab-panel],[data-sb-tab-title]{display:block!important}'

async function assertTapTargets(page: Page): Promise<void> {
  const tabs = page.locator(TAB)
  const count = await tabs.count()
  expect(count, 'the fixture must render tabs').toBeGreaterThan(0)
  for (let i = 0; i < count; i += 1) {
    await expect(tabs.nth(i), `tab ${i} must be visible`).toBeVisible()
    // Auto-retrying: the CDN-injected stylesheet can land just after `load`,
    // so wait for the minimum-size utilities before measuring anything.
    await expect(tabs.nth(i), `tab ${i} min-height`).toHaveCSS('min-height', '40px')
    await expect(tabs.nth(i), `tab ${i} min-width`).toHaveCSS('min-width', '40px')
    const box = await tabs.nth(i).boundingBox()
    expect(box, `tab ${i} must render a measurable box`).not.toBeNull()
    expect(box!.width, `tab ${i} width at 390px`).toBeGreaterThanOrEqual(32)
    expect(box!.height, `tab ${i} height at 390px`).toBeGreaterThanOrEqual(32)
  }
}

/** Exactly one panel is shown; the matching tab owns the selected state. */
async function assertSelection(page: Page, selected: number): Promise<void> {
  const panels = page.locator(PANEL)
  const tabs = page.locator(TAB)
  const count = await panels.count()
  expect(count).toBeGreaterThan(selected)
  for (let i = 0; i < count; i += 1) {
    if (i === selected) await expect(panels.nth(i), `panel ${i} shown`).toBeVisible()
    else await expect(panels.nth(i), `panel ${i} hidden`).toBeHidden()
    await expect(tabs.nth(i)).toHaveAttribute('aria-selected', i === selected ? 'true' : 'false')
  }
}

test.describe('tabs on a phone-width viewport', () => {
  test('tap targets, panel switching and keyboard movement', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openExportedPage(page, 'tabs')

    await assertTapTargets(page)
    await assertSelection(page, 0)

    await page.locator(TAB).nth(2).click()
    await assertSelection(page, 2)

    // A real ArrowRight moves focus and selection together.
    await page.locator(TAB).nth(0).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator(TAB).nth(1)).toBeFocused()
    await assertSelection(page, 1)

    // Wrapping left from the first tab lands on the last one.
    await page.locator(TAB).nth(0).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator(TAB).nth(2)).toBeFocused()
    await assertSelection(page, 2)
  })

  test('two tab sets keep their own selection and tap targets', async ({ page }) => {
    // Explicit, not inherited from the config: this is a 390 px claim.
    await page.setViewportSize({ width: 390, height: 844 })
    await openExportedPage(page, 'two-tab-sets')
    await assertTapTargets(page)

    const lists = page.locator(TABLIST)
    expect(await lists.count()).toBe(2)
    await lists.nth(1).locator(TAB).nth(1).click()

    const views = await page.locator(PANEL).evaluateAll((panels) =>
      panels.map((panel) => !(panel as HTMLElement).hidden),
    )
    expect(views).toEqual([true, false, false, false, true, false])
  })
})

test.describe('what assistive technology is told', () => {
  test('tablist, tab names and the selected tabpanel wiring', async ({ page }) => {
    await openExportedPage(page, 'tabs')
    await expect(page.getByRole('tablist')).toHaveCount(1)

    for (let i = 0; i < TITLES.length; i += 1) {
      const tab = page.getByRole('tab', { name: TITLES[i] })
      await expect(tab).toHaveCount(1)
      await expect(tab).toHaveAttribute('aria-selected', i === 0 ? 'true' : 'false')
      await expect(tab).toHaveAttribute('tabindex', i === 0 ? '0' : '-1')
    }

    const second = page.getByRole('tab', { name: TITLES[1] })
    await second.click()
    await expect(second).toHaveAttribute('aria-selected', 'true')

    const panelId = await second.getAttribute('aria-controls')
    expect(panelId).not.toBeNull()
    const panel = page.locator(`#${panelId}`)
    await expect(panel).toHaveAttribute('role', 'tabpanel')
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('aria-labelledby', (await second.getAttribute('id'))!)
  })
})

test.describe('a visitor without scripting', () => {
  async function openNoScript(browser: Browser, fixture: Fixture): Promise<Page> {
    const html = exportedHtml(fixture)
    expect(html, 'the tab strip must be dropped without script').toContain(TABLIST_HIDDEN)
    expect(html, 'the panels must be shown without script').toContain(PANELS_SHOWN)
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    return page
  }

  async function assertNoScriptRender(page: Page, sets: number): Promise<void> {
    const lists = page.locator(TABLIST)
    await expect(lists).toHaveCount(sets)
    for (let i = 0; i < sets; i += 1) {
      await expect(lists.nth(i), `tab list ${i} must be hidden`).toBeHidden()
      expect(await lists.nth(i).evaluate((el) => getComputedStyle(el).display)).toBe('none')
    }

    const titles = page.locator('[data-sb-tab-title]')
    await expect(titles).toHaveCount(TITLES.length * sets)
    expect(await titles.allTextContents()).toEqual(
      Array.from({ length: sets }, () => TITLES).flat(),
    )

    const panels = page.locator(PANEL)
    await expect(panels).toHaveCount(TITLES.length * sets)
    const descriptions = await page.locator(`${PANEL} p`).allTextContents()
    expect(descriptions).toEqual(Array.from({ length: sets }, () => DESCRIPTIONS).flat())

    for (let i = 0; i < (await panels.count()); i += 1) {
      const panel = panels.nth(i)
      // The panel carries `hidden` in the markup; the no-script declaration
      // must win over the user agent rule, not merely restate it. Asserting the
      // attribute keeps the override claim from passing on markup that simply
      // dropped the state.
      if (i % TITLES.length > 0) {
        expect(
          await panel.evaluate((el) => el.hasAttribute('hidden')),
          `panel ${i} must still carry the hidden state`,
        ).toBe(true)
      }
      await expect(panel, `panel ${i} must be visible without script`).toBeVisible()
      expect(await panel.evaluate((el) => getComputedStyle(el).display)).not.toBe('none')
      const box = await panel.boundingBox()
      expect(box!.height, `panel ${i} must have real height`).toBeGreaterThan(0)

      expect(
        await panel.evaluate((el) => el.firstElementChild?.hasAttribute('data-sb-tab-title') ?? false),
        `panel ${i} must lead with its item title`,
      ).toBe(true)
      const title = panel.locator('[data-sb-tab-title]').first()
      await expect(title, `panel ${i} title must be visible`).toBeVisible()
      const description = panel.locator('p').first()
      await expect(description, `panel ${i} description must be visible`).toBeVisible()
      expect((await title.boundingBox())!.y).toBeLessThan((await description.boundingBox())!.y)
    }
  }

  test('one tab set renders every panel in item order', async ({ browser }) => {
    const page = await openNoScript(browser, 'tabs')
    await assertNoScriptRender(page, 1)
    await page.context().close()
  })

  test('two tab sets render every panel in item order', async ({ browser }) => {
    const page = await openNoScript(browser, 'two-tab-sets')
    await assertNoScriptRender(page, 2)
    await page.context().close()
  })
})
