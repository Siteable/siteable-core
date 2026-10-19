import { test, expect } from '@playwright/test'
import { exportedHtml, openExportedPage } from './exported-page'

/**
 * Browser automation for the three checks that were previously manual-only.
 *
 * Scope honesty: a machine can prove layout, computed CSS, the accessibility
 * tree and script-disabled rendering. It cannot prove that a panel "feels
 * right" under a finger, or that a screen reader's voice is pleasant. Those
 * subjective residues stay human; everything else is asserted here.
 */

const TOGGLE = '[data-sb-menu-toggle]'
const PANEL = '[data-sb-menu-panel]'

test.describe('mobile menu on a phone-width viewport', () => {
  test('mobile menu: opens under the bar, links are tappable, the bar does not shift', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openExportedPage(page, 'navbar-and-faq')

    const toggle = page.locator(TOGGLE).first()
    const panel = page.locator(PANEL).first()
    const nav = page.locator('nav').first()

    await expect(toggle).toBeVisible()
    await expect(panel).toBeHidden()

    const tapTarget = await toggle.boundingBox()
    expect(tapTarget, 'hamburger must render a measurable box').not.toBeNull()
    expect(tapTarget!.width, 'tap target width').toBeGreaterThanOrEqual(32)
    expect(tapTarget!.height, 'tap target height').toBeGreaterThanOrEqual(32)

    const navBefore = await nav.boundingBox()
    expect(navBefore).not.toBeNull()

    await toggle.click()
    await expect(panel).toBeVisible()

    const navAfter = await nav.boundingBox()
    const panelBox = await panel.boundingBox()
    expect(panelBox).not.toBeNull()
    expect(navAfter).not.toBeNull()

    expect(panelBox!.y, 'panel must sit below the bar, not overlap it').toBeGreaterThanOrEqual(
      navAfter!.y + navAfter!.height - 1
    )
    expect(navAfter!.height, 'opening the panel must not resize the bar').toBeCloseTo(navBefore!.height, 1)

    const links = panel.locator('a')
    const linkCount = await links.count()
    expect(linkCount).toBeGreaterThan(0)
    for (let i = 0; i < linkCount; i += 1) {
      const link = links.nth(i)
      await expect(link).toBeVisible()
      const box = await link.boundingBox()
      expect(box!.height, `link ${i} must be tall enough to tap`).toBeGreaterThanOrEqual(20)
      expect((await link.textContent())?.trim().length, `link ${i} must have a label`).toBeGreaterThan(0)
    }

    await toggle.click()
    await expect(panel).toBeHidden()
  })
})

test.describe('what assistive technology is told', () => {
  test('assistive tech: the menu button and the faq items expose their state', async ({ page }) => {
    await openExportedPage(page, 'navbar-and-faq')

    const toggle = page.locator(TOGGLE).first()
    await expect(toggle).toHaveAccessibleName(/toggle menu/i)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAttribute('aria-controls', /^sb_menu_/)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // The panel the button controls must be the one that became reachable.
    const controlledId = await toggle.getAttribute('aria-controls')
    const controlledPanel = page.locator(`#${controlledId}`)
    await expect(controlledPanel).toBeVisible()
    await expect(page.locator(`${PANEL}`).first()).toHaveAttribute('id', controlledId!)

    const firstLink = controlledPanel.locator('a').first()
    await expect(firstLink).toBeVisible()

    // FAQ: the first item starts expanded, activating it collapses it, and the
    // state change is exposed on the button rather than only visually.
    const faqButtons = page.locator('section:has(.faq-content) button[aria-expanded]')
    const faqCount = await faqButtons.count()
    expect(faqCount, 'the fixture must render faq items').toBeGreaterThan(0)
    await expect(faqButtons.first()).toHaveAttribute('aria-expanded', 'true')
    await expect(faqButtons.nth(1)).toHaveAttribute('aria-expanded', 'false')

    await faqButtons.first().click()
    await expect(faqButtons.first()).toHaveAttribute('aria-expanded', 'false')
    await expect(faqButtons.nth(1)).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('a visitor without scripting', () => {
  test('no script: answers are visible, links are visible, no dead hamburger', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    })
    const page = await context.newPage()
    await page.setContent(exportedHtml('navbar-and-faq'), { waitUntil: 'load' })

    const toggle = page.locator(TOGGLE).first()
    await expect(toggle, 'the hamburger cannot work without script, so it must be hidden').toBeHidden()

    const panel = page.locator(PANEL).first()
    await expect(panel).toBeVisible()

    const links = panel.locator('a')
    const linkCount = await links.count()
    expect(linkCount).toBeGreaterThan(0)
    for (let i = 0; i < linkCount; i += 1) {
      await expect(links.nth(i)).toBeVisible()
    }

    const answers = page.locator('.faq-content')
    const answerCount = await answers.count()
    expect(answerCount).toBeGreaterThan(0)

    for (let i = 0; i < answerCount; i += 1) {
      const answer = answers.nth(i)
      await expect(answer, `answer ${i} must be visible without script`).toBeVisible()
      const box = await answer.boundingBox()
      expect(box!.height, `answer ${i} must have real height`).toBeGreaterThan(0)
      const maxHeight = await answer.evaluate((el) => getComputedStyle(el).maxHeight)
      expect(maxHeight, `answer ${i} max-height must not be clamped to 0`).not.toBe('0px')
    }

    await context.close()
  })
})
