/**
 * Phase 05 — exporter link/URL rendering for navbar, footer and pricing.
 *
 * Spec: `specs/publish-fidelity/spec.md` FR-003, SC-013, SC-014, SC-015, SC-016.
 * Module under test: `src/lib/export-html.ts` (renderNavbar / renderFooter* / renderPricingSimple).
 *
 * Rule: a link item carrying a policy-passing `href` publishes as a real `<a>`;
 * every rejected/empty href (and every legacy bare string) keeps today's non-anchor
 * output byte-identically. The strongest byte-identity proof lives in
 * `tests/export-legacy-snapshot.test.ts` (phase-01 whole-document tripwire); the
 * substring assertions here pin the exact markup shape at each call site.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { SiteConfig } from '../src/blocks/types'

/** Exact class strings read from the exporter's call sites. */
const NAV_LINK_CLASS =
  'text-[13px] text-text-2 hover:text-text-0 transition-colors cursor-pointer'
const NAV_CTA_CLASS =
  'px-4 py-2 rounded-lg bg-green text-black text-[13px] font-semibold hover:bg-green-dim transition-colors'
const FOOTER_SIMPLE_CLASS =
  'text-[12px] text-text-3 hover:text-text-1 transition-colors cursor-pointer'
const FOOTER_COL_CLASS =
  'text-[12.5px] text-text-3 hover:text-text-1 transition-colors cursor-pointer'
const FOOTER_BOTTOM_CLASS =
  'text-[11px] text-text-3 hover:text-text-1 transition-colors cursor-pointer'
const FOOTER_MINIMAL_CLASS = 'hover:text-text-1 transition-colors cursor-pointer'
const PRICING_BTN_PLAIN =
  'w-full py-2.5 rounded-lg text-sm font-semibold transition-all bg-bg-3 text-text-0 border border-border-default hover:bg-bg-4 hover:border-border-hover'
const PRICING_BTN_FEATURED =
  'w-full py-2.5 rounded-lg text-sm font-semibold transition-all bg-green text-black hover:bg-green-dim'

function oneBlock(type: string, variant: string, props: Record<string, unknown>): SiteConfig {
  return { name: 'Site', blocks: [{ id: 'b1', type, variant, props } as never] }
}

describe('SC-013 — string-only link configs stay byte-identical (non-anchor output)', () => {
  it('navbar string links render as spans with the nav link class', () => {
    const html = exportSiteToHTML(
      oneBlock('navbar', 'default', { logo: 'A', links: ['Features', 'Pricing'], ctaText: 'Go' }),
    )
    expect(html).toContain(`<span class="${NAV_LINK_CLASS}">Features</span>`)
    expect(html).toContain(`<span class="${NAV_LINK_CLASS}">Pricing</span>`)
    // No href exists anywhere in a string-only navbar.
    expect(html).not.toContain('<a href=')
  })

  it('footer simple / multi-column columns+bottom / minimal string links render as spans', () => {
    const simple = exportSiteToHTML(
      oneBlock('footer', 'simple', { logo: 'A', copyright: 'c', links: ['Privacy', 'Terms'] }),
    )
    expect(simple).toContain(`<span class="${FOOTER_SIMPLE_CLASS}">Privacy</span>`)
    expect(simple).toContain(`<span class="${FOOTER_SIMPLE_CLASS}">Terms</span>`)

    const multi = exportSiteToHTML(
      oneBlock('footer', 'multi-column', {
        logo: 'A',
        copyright: 'c',
        links: ['Privacy'],
        columns: [{ title: 'Product', links: ['Features', 'Pricing'] }],
      }),
    )
    expect(multi).toContain(`<li><span class="${FOOTER_COL_CLASS}">Features</span></li>`)
    expect(multi).toContain(`<li><span class="${FOOTER_COL_CLASS}">Pricing</span></li>`)
    expect(multi).toContain(`<span class="${FOOTER_BOTTOM_CLASS}">Privacy</span>`)

    const minimal = exportSiteToHTML(
      oneBlock('footer', 'minimal', { copyright: 'c', links: ['Privacy', 'Terms'] }),
    )
    expect(minimal).toContain(`<span class="${FOOTER_MINIMAL_CLASS}">Privacy</span>`)
    expect(minimal).toContain(`<span class="${FOOTER_MINIMAL_CLASS}">Terms</span>`)
    expect(minimal).not.toContain('<a href=')
  })

  it('pricing tiers without ctaUrl still render the current button element', () => {
    const html = exportSiteToHTML(
      oneBlock('pricing', 'simple', {
        title: 'P',
        tiers: [{ name: 'Free', price: '$0', features: ['x'], cta: 'Start' }],
      }),
    )
    expect(html).toContain(`<button class="${PRICING_BTN_PLAIN}">Start</button>`)
    expect(html).not.toContain('<a href=')
  })

  it('the shared default tiers (no `tiers` prop) render the button branch with their labels', () => {
    // Pins the shared `defaultPricingTiers` fallback: every default tier's
    // falsy `ctaUrl: ''` routes to the button, and the shared default's labels
    // must match what the exporter renders. Closes the gap where neither the
    // whole-document fixture nor the explicit-tier cases exercise the default.
    const html = exportSiteToHTML(oneBlock('pricing', 'simple', { title: 'P' }))
    expect(html).toContain(`<button class="${PRICING_BTN_PLAIN}">Get Started</button>`)
    expect(html).toContain(`<button class="${PRICING_BTN_FEATURED}">Upgrade to Pro</button>`)
    expect(html).toContain(`<button class="${PRICING_BTN_PLAIN}">Contact Sales</button>`)
    expect(html).not.toContain('<a href=')
  })
})

describe('SC-014 — a policy-passing href publishes as a real anchor', () => {
  it('navbar link object renders an anchor carrying the label and href', () => {
    const html = exportSiteToHTML(
      oneBlock('navbar', 'default', {
        logo: 'A',
        links: [{ label: 'About', href: 'https://x/about' }],
        ctaText: 'Go',
      }),
    )
    expect(html).toContain(`<a href="https://x/about" class="${NAV_LINK_CLASS}">About</a>`)
  })

  it('navbar ctaUrl renders the CTA as an anchor when it passes policy', () => {
    const html = exportSiteToHTML(
      oneBlock('navbar', 'default', { logo: 'A', links: ['X'], ctaText: 'Get Started', ctaUrl: 'https://x/signup' }),
    )
    expect(html).toContain(`<a href="https://x/signup" class="${NAV_CTA_CLASS}">Get Started</a>`)
    expect(html).not.toContain(`<button class="${NAV_CTA_CLASS}">`)
  })

  it('footer link objects (simple, columns[].links, and minimal) render anchors', () => {
    const simple = exportSiteToHTML(
      oneBlock('footer', 'simple', {
        logo: 'A',
        copyright: 'c',
        links: [{ label: 'Privacy', href: '/privacy' }],
      }),
    )
    expect(simple).toContain(`<a href="/privacy" class="${FOOTER_SIMPLE_CLASS}">Privacy</a>`)

    const multi = exportSiteToHTML(
      oneBlock('footer', 'multi-column', {
        logo: 'A',
        copyright: 'c',
        links: [{ label: 'Privacy', href: '/p' }],
        columns: [{ title: 'Product', links: [{ label: 'Docs', href: '/docs' }] }],
      }),
    )
    expect(multi).toContain(`<li><a href="/docs" class="${FOOTER_COL_CLASS}">Docs</a></li>`)
    expect(multi).toContain(`<a href="/p" class="${FOOTER_BOTTOM_CLASS}">Privacy</a>`)

    const minimal = exportSiteToHTML(
      oneBlock('footer', 'minimal', {
        copyright: 'c',
        links: [{ label: 'Terms', href: 'https://x/terms' }],
      }),
    )
    expect(minimal).toContain(`<a href="https://x/terms" class="${FOOTER_MINIMAL_CLASS}">Terms</a>`)
  })
})

describe('SC-015 — a rejected href never becomes an anchor and never appears in the output', () => {
  it('navbar link object with a javascript: href degrades to the non-anchor element', () => {
    const html = exportSiteToHTML(
      oneBlock('navbar', 'default', {
        logo: 'A',
        links: [{ label: 'About', href: 'javascript:alert(1)' }],
        ctaText: 'Go',
      }),
    )
    expect(html).toContain(`<span class="${NAV_LINK_CLASS}">About</span>`)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a href=')
  })

  it('navbar ctaUrl with a rejected scheme falls back to the button and drops the value', () => {
    const html = exportSiteToHTML(
      oneBlock('navbar', 'default', { logo: 'A', links: ['X'], ctaText: 'Go', ctaUrl: 'javascript:alert(1)' }),
    )
    expect(html).toContain(`<button class="${NAV_CTA_CLASS}">Go</button>`)
    expect(html).not.toContain('javascript:')
  })

  it('footer link object with a rejected href degrades to the non-anchor element', () => {
    const html = exportSiteToHTML(
      oneBlock('footer', 'simple', {
        logo: 'A',
        copyright: 'c',
        links: [{ label: 'Terms', href: 'javascript:alert(1)' }],
      }),
    )
    expect(html).toContain(`<span class="${FOOTER_SIMPLE_CLASS}">Terms</span>`)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a href=')
  })
})

describe('SC-016 — pricing tier ctaUrl', () => {
  it('renders an anchor carrying btnClass when ctaUrl passes policy', () => {
    const html = exportSiteToHTML(
      oneBlock('pricing', 'simple', {
        title: 'P',
        tiers: [{ name: 'Pro', price: '$19', features: ['x'], cta: 'Upgrade', ctaUrl: 'https://x', featured: true }],
      }),
    )
    expect(html).toContain(`<a href="https://x" class="${PRICING_BTN_FEATURED}">Upgrade</a>`)
    expect(html).not.toContain(`<button class="${PRICING_BTN_FEATURED}">`)
  })

  it('falls back to the button when ctaUrl is absent', () => {
    const html = exportSiteToHTML(
      oneBlock('pricing', 'simple', {
        title: 'P',
        tiers: [{ name: 'Free', price: '$0', features: ['x'], cta: 'Start' }],
      }),
    )
    expect(html).toContain(`<button class="${PRICING_BTN_PLAIN}">Start</button>`)
    expect(html).not.toContain('<a href=')
  })

  it('falls back to the button (and drops the value) when ctaUrl fails policy', () => {
    const html = exportSiteToHTML(
      oneBlock('pricing', 'simple', {
        title: 'P',
        tiers: [{ name: 'Free', price: '$0', features: ['x'], cta: 'Start', ctaUrl: 'javascript:alert(1)' }],
      }),
    )
    expect(html).toContain(`<button class="${PRICING_BTN_PLAIN}">Start</button>`)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a href=')
  })
})
