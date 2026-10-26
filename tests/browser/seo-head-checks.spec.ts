import { test, expect } from '@playwright/test'
import { exportSiteToHTML } from '../../src/lib/export-html'

/**
 * Real-browser check of the SEO head: the canonical link is present, the
 * non-blocking font link flips to a stylesheet after load, and the first hero
 * image carries a high fetch priority.
 */
test('exported head: canonical, font swap and hero priority', async ({ page }) => {
  const html = exportSiteToHTML(
    {
      name: 'Site',
      blocks: [
        {
          id: 'hero-1',
          type: 'hero',
          variant: 'split',
          props: { headline: 'Hello', heroImage: 'https://cdn.example.com/hero.png' },
        },
      ],
    } as never,
    { siteUrl: 'https://example.com' },
  )

  // Serve the font stylesheet locally so the swap does not depend on the network.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts */' }),
  )
  await page.setContent(html, { waitUntil: 'load' })

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://example.com/')
  await expect(page.locator('link[href*="fonts.googleapis.com/css2"][rel="stylesheet"]')).toHaveCount(1)
  expect(await page.locator('img[fetchpriority="high"]').count()).toBeGreaterThanOrEqual(1)
  expect(await page.locator('script[type="application/ld+json"]').count()).toBe(1)
})
