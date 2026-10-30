import { test, expect, type Page } from '@playwright/test'
import { exportSiteToHTML } from '../../src/lib/export-html'

/**
 * Real-browser checks for the facebook-page block.
 *
 * The frame's own content is Facebook's, so every request to facebook.com is
 * answered with a local empty page and counted. That proves the CONTAINER fits
 * the viewport; it says nothing about how the real plugin lays itself out
 * inside the frame, which only a look at a live Page can show.
 *
 * Both layout claims depend on the Tailwind Play CDN styling the page, so each
 * test first asserts those styles are applied and only then measures.
 */

const PAGE_URL = 'https://www.facebook.com/acme'

function pageHtml(url: string): string {
  return exportSiteToHTML({
    name: 'Site',
    blocks: [
      {
        id: 'fb-1',
        type: 'facebook-page',
        variant: 'default',
        props: { title: 'Follow us', url, height: '500' },
      },
    ],
  } as Parameters<typeof exportSiteToHTML>[0])
}

/** Answer every facebook.com request locally and count them. */
async function routeFacebook(page: Page): Promise<{ hits: () => number }> {
  let count = 0
  await page.route(/^https?:\/\/([^/]+\.)?facebook\.com\//, async (route) => {
    count += 1
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>x</title>',
    })
  })
  return { hits: () => count }
}

async function expectCdnStylesApplied(page: Page, padding = '24px'): Promise<void> {
  const wrapperPadding = await page.evaluate(
    () => getComputedStyle(document.querySelector('div.px-6')!).paddingLeft,
  )
  expect(wrapperPadding, 'the CDN stylesheet must have styled the wrapper').toBe(padding)
  const frameBorder = await page.evaluate(
    () => getComputedStyle(document.querySelector('iframe')!.parentElement!).borderTopWidth,
  )
  expect(frameBorder, 'the CDN stylesheet must have styled the frame container').toBe('1px')
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const width = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(width.document, 'the document must not scroll sideways').toBeLessThanOrEqual(width.client)
  expect(width.body, 'the body must not scroll sideways').toBeLessThanOrEqual(width.client)
}

test.describe('a Page timeline at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the frame stays inside the viewport without sideways scrolling', async ({ page }) => {
    const facebook = await routeFacebook(page)
    await page.setContent(pageHtml(PAGE_URL), { waitUntil: 'load' })
    await expectCdnStylesApplied(page)
    const frame = page.locator('iframe')
    await expect(frame).toHaveCount(1)
    await expect
      .poll(() => facebook.hits(), 'the routed facebook.com request was made')
      .toBeGreaterThanOrEqual(1)

    await noSidewaysScroll(page)
    const box = await frame.boundingBox()
    const client = await page.evaluate(() => document.documentElement.clientWidth)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(client)
    expect(box!.width).toBeLessThanOrEqual(340)
  })

  test('an address that does not embed renders a placeholder and no frame request', async ({
    page,
  }) => {
    const facebook = await routeFacebook(page)
    await page.setContent(pageHtml('https://example.com/acme'), {
      waitUntil: 'load',
    })
    const padding = await page.evaluate(
      () => getComputedStyle(document.querySelector('div.px-6')!).paddingLeft,
    )
    expect(padding, 'the CDN stylesheet must have styled the wrapper').toBe('24px')
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(facebook.hits()).toBe(0)
    await noSidewaysScroll(page)
  })
})

test.describe('a Page timeline on a wide screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the frame is 340 px wide and centred', async ({ page }) => {
    const facebook = await routeFacebook(page)
    await page.setContent(pageHtml(PAGE_URL), { waitUntil: 'load' })
    await expectCdnStylesApplied(page, '40px')
    await expect.poll(() => facebook.hits()).toBeGreaterThanOrEqual(1)
    const box = await page.locator('iframe').boundingBox()
    const client = await page.evaluate(() => document.documentElement.clientWidth)
    // The capped element is the bordered container (340 px); the frame fills its
    // content box, so it is 340 minus the two 1 px borders.
    const container = await page.locator('iframe').locator('xpath=..').boundingBox()
    expect(Math.abs(container!.width - 340)).toBeLessThanOrEqual(1)
    expect(Math.abs(box!.width - (container!.width - 2))).toBeLessThanOrEqual(1)
    expect(Math.abs(box!.x + box!.width / 2 - client / 2)).toBeLessThanOrEqual(1)
  })
})

test.describe('when the stylesheet CDN is blocked', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the inline cap alone keeps the frame inside the viewport', async ({ page }) => {
    await routeFacebook(page)
    await page.route(/cdn\.tailwindcss\.com/, (route) => route.abort())
    await page.setContent(pageHtml(PAGE_URL), { waitUntil: 'load' })
    const padding = await page.evaluate(
      () => getComputedStyle(document.querySelector('div.px-6')!).paddingLeft,
    )
    expect(padding, 'the stylesheet must NOT be applied in this case').not.toBe('24px')
    await noSidewaysScroll(page)
    const box = await page.locator('iframe').boundingBox()
    const client = await page.evaluate(() => document.documentElement.clientWidth)
    expect(box!.x + box!.width).toBeLessThanOrEqual(client)
    expect(box!.width, 'the inline cap must hold without the stylesheet').toBeLessThanOrEqual(340)
  })
})
