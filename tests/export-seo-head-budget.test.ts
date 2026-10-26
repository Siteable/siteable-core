/**
 * Size budget for what the exporter adds to the document head: canonical link,
 * Twitter card tags, structured data and the non-blocking font links, measured
 * on a realistic eight-block page with a ten-item FAQ.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

export const HEAD_BUDGET_BYTES = 4608

const block = (type: string, props: Record<string, unknown>): BlockConfig =>
  ({ id: type, type, props }) as unknown as BlockConfig

const FAQ_ITEMS = Array.from({ length: 10 }, (_, i) => ({
  question: `How does feature number ${i + 1} work for a small business owner?`,
  answer:
    `Feature ${i + 1} works out of the box: pick a layout, edit the text in place and publish. ` +
    'You can change your mind at any time, and your previous version stays available if you need it back.',
}))

const REFERENCE: SiteConfig = {
  name: 'Handmade Crafts Studio',
  blocks: [
    block('navbar', {
      logo: 'Crafts',
      logoImage: 'https://cdn.example.com/assets/brand/logo-wordmark.png',
      links: [{ label: 'Products', href: '#products' }],
    }),
    block('hero', { headline: 'Handmade with care', subheadline: 'Crafts from our workshop.' }),
    block('features', { title: 'Why us', items: [{ icon: 'Zap', title: 'Fast', description: 'Quick' }] }),
    block('faq', { title: 'Questions', items: FAQ_ITEMS }),
    block('pricing', { title: 'Plans', tiers: [{ name: 'Basic', price: '$9', features: ['A'] }] }),
    block('testimonials', { title: 'Loved', items: [{ quote: 'Great', name: 'Ada', role: 'CEO' }] }),
    block('cta', { headline: 'Ready?', buttonText: 'Go', buttonUrl: 'https://example.com/go' }),
    block('footer', { logo: 'Crafts', copyright: '2026 Crafts' }),
  ],
} as SiteConfig

function addedHeadBytes(html: string): { total: number; parts: Record<string, number> } {
  const head = html.slice(0, html.indexOf('</head>'))
  const pick = (re: RegExp): string => (head.match(re) ?? []).join('')
  const parts = {
    canonical: pick(/ *<link rel="canonical"[^>]*>\n?/g),
    twitter: pick(/ *<meta name="twitter:[^>]*>\n?/g),
    jsonLd: pick(/ *<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/g),
    fonts: pick(/ *<link rel="preload" as="style"[^>]*>\n?| *<noscript><link rel="stylesheet"[^>]*><\/noscript>\n?/g),
  }
  const bytes = Object.fromEntries(
    Object.entries(parts).map(([k, v]) => [k, Buffer.byteLength(v, 'utf8')]),
  )
  return { total: Object.values(bytes).reduce((a, b) => a + b, 0), parts: bytes }
}

describe('added head size', () => {
  it(`stays within ${HEAD_BUDGET_BYTES} bytes on the reference page`, () => {
    const html = exportSiteToHTML(REFERENCE, {
      siteUrl: 'https://crafts.example.com',
      settings: {
        siteName: 'Handmade Crafts Studio',
        seoDescription: 'Handmade crafts and gifts, made to order in our own workshop.',
        ogImageUrl: 'https://cdn.example.com/assets/og/cover-1200x630.jpg',
      },
    })
    const { total, parts } = addedHeadBytes(html)
    expect(parts.jsonLd, 'json-ld must be present').toBeGreaterThan(0)
    expect(
      total,
      `added head is ${total} bytes (budget ${HEAD_BUDGET_BYTES}): ${JSON.stringify(parts)}`,
    ).toBeLessThanOrEqual(HEAD_BUDGET_BYTES)
  })
})
