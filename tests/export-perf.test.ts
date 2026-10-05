/**
 * SC-026 / NF-001 — whole-atom export performance and purity.
 *
 * Spec: `specs/publish-fidelity/spec.md`.
 *   - SC-026: a 19-block config exported 100 times completes under the 500 ms
 *     budget.
 *   - NF-001 (export half): a 19-block config exports in < 500 ms.
 *
 * Phase-07 of the publish-fidelity plan. This file is the perf gate the earlier
 * phases deferred; the URL-policy half of NF-001 lives in `tests/url-policy.test.ts`.
 *
 * These are wall-clock assertions and are inherently sensitive to a loaded
 * machine. When one fails the message says so explicitly — re-run on an idle box
 * before treating a failure as a regression. The threshold is the spec's; it is
 * NOT relaxed here.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { SiteConfig } from '../src/blocks/types'

/**
 * One block of every declared type, each carrying realistic non-empty props so
 * the renderers do real work (a config of empty props would measure nothing).
 * The block order matches the canonical order in `src/blocks/types.ts`.
 */
const DENSE_CONFIG: SiteConfig = {
  name: 'Perf',
  blocks: [
    { id: 'p-navbar', type: 'navbar', variant: 'default', props: { logo: 'Acme', links: [{ label: 'Home', href: 'https://x/home' }, 'Pricing'], ctaText: 'Start', ctaUrl: 'https://x/start' } },
    { id: 'p-hero', type: 'hero', variant: 'centered', props: { headline: 'Build faster', subheadline: 'Ship your site today.', primaryCta: 'Go', primaryCtaUrl: 'https://x/go', secondaryCta: 'Docs', secondaryCtaUrl: 'https://x/docs' } },
    { id: 'p-features', type: 'features', variant: 'grid', props: { title: 'Features', items: [{ icon: 'Zap', title: 'Fast', description: 'Very fast' }, { icon: 'Shield', title: 'Safe', description: 'Very safe' }] } },
    { id: 'p-pricing', type: 'pricing', variant: 'simple', props: { title: 'Plans', tiers: [{ name: 'Pro', price: '$19', period: '/mo', features: ['A', 'B'], cta: 'Buy', ctaUrl: 'https://x/buy' }] } },
    { id: 'p-cta', type: 'cta', variant: 'simple', props: { headline: 'Ready?', subheadline: 'Start now', buttonText: 'Go', buttonUrl: 'https://x/cta' } },
    { id: 'p-footer', type: 'footer', variant: 'multi-column', props: { logo: 'Acme', copyright: '2026 Acme', links: [{ label: 'Privacy', href: 'https://x/p' }], columns: [{ title: 'Product', links: [{ label: 'Features', href: 'https://x/f' }] }] } },
    { id: 'p-testimonials', type: 'testimonials', variant: 'cards', props: { title: 'Loved', items: [{ quote: 'Great product', name: 'Ada', role: 'CEO', avatar: 'https://x/a.png' }] } },
    { id: 'p-stats', type: 'stats', variant: 'grid', props: { title: 'Numbers', items: [{ label: 'Users', value: '10K' }, { label: 'Uptime', value: '99.9%' }] } },
    { id: 'p-faq', type: 'faq', variant: 'accordion', props: { title: 'FAQ', items: [{ question: 'Q1?', answer: 'A1' }, { question: 'Q2?', answer: 'A2' }] } },
    { id: 'p-team', type: 'team', variant: 'grid', props: { title: 'Team', members: [{ name: 'Ada', role: 'Eng', avatar: 'https://x/t.png' }] } },
    { id: 'p-contact', type: 'contact', variant: 'form', props: { title: 'Contact', subtitle: 'Say hi' } },
    { id: 'p-newsletter', type: 'newsletter', variant: 'simple', props: { title: 'News', subtitle: 'Subscribe', buttonText: 'Join' } },
    { id: 'p-logocloud', type: 'logocloud', variant: 'default', props: { title: 'Trusted', logos: ['Vercel', 'Stripe', 'GitHub'] } },
    { id: 'p-content', type: 'content', variant: 'prose', props: { body: '## Heading\n\nSome **bold** and *italic* text.\n\n- one\n- two\n- three' } },
    { id: 'p-image', type: 'image', variant: 'hero-image', props: { src: 'https://x/i.png', alt: 'An image', title: 'Story' } },
    { id: 'p-video', type: 'video', variant: 'youtube', props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Watch' } },
    { id: 'p-gallery', type: 'gallery', variant: 'grid', props: { title: 'Gallery', images: [{ src: 'https://x/g.png', alt: 'g' }] } },
    { id: 'p-divider', type: 'divider', variant: 'line', props: { height: 60, width: 'full' } },
    { id: 'p-banner', type: 'banner', variant: 'ribbon', props: { text: 'New!', linkText: 'More', linkUrl: 'https://x/more' } },
  ],
}

const BUDGET_MS = 500
const RUNS = 100

describe('SC-026 / NF-001 — export performance', () => {
  it('renders all 19 block types (the benchmark is non-vacuous)', () => {
    const html = exportSiteToHTML(DENSE_CONFIG)
    expect(html).not.toContain('Unknown block type')
    // Every declared block contributes markup.
    expect(html).toContain('Build faster')
    expect(html).toContain('Gallery')
    expect(html).toContain('New!')
  })

  it(`exports the 19-block config ${RUNS}x within the ${BUDGET_MS} ms budget`, () => {
    // Warm-up: let V8 JIT the render path and lazily-init modules before timing.
    exportSiteToHTML(DENSE_CONFIG)

    const started = performance.now()
    for (let i = 0; i < RUNS; i += 1) exportSiteToHTML(DENSE_CONFIG)
    const total = performance.now() - started
    const perExport = total / RUNS

    expect(
      total,
      `${RUNS} exports of a 19-block config took ${total.toFixed(1)} ms ` +
        `(${perExport.toFixed(3)} ms/export); the spec budget is ${BUDGET_MS} ms total. ` +
        'A failure here is usually a loaded machine, not a regression — re-run on an ' +
        'idle box before treating it as one.'
    ).toBeLessThan(BUDGET_MS)
  })

  it('is pure — two consecutive exports of the same config are byte-identical', () => {
    // Phase-06 invariant (FR-005 id dedupe uses a per-call Set): a module-level
    // Set would leak across calls and make the second export drop ids.
    expect(exportSiteToHTML(DENSE_CONFIG)).toBe(exportSiteToHTML(DENSE_CONFIG))
  })
})
