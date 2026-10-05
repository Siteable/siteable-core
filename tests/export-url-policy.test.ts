/**
 * SC-001 / SC-003 / SC-004 — the URL policy applied at the export chokepoints.
 *
 * Spec: `specs/publish-fidelity/spec.md` FR-001 / FR-004.
 * Phase: `plans/261005-0718-.../phase-02-apply-url-policy-in-export.md`.
 * Module under test: `src/lib/export-html.ts` (`renderLink` + export settings).
 *
 * FR-001 scope note (intentional, do NOT "fix" into scope): `gaId` and
 * `posthogKey` are interpolated into a `<script>` BODY, not into an `href` /
 * `src` attribute. `encodeURIComponent` / `JSON.stringify` handle them and the
 * URL policy does not apply. They are deliberately left un-gated here.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { SiteConfig } from '../src/blocks/types'

/** Exact class strings read from `renderLink` call sites in `export-html.ts`. */
const HERO_PRIMARY_CLASS =
  'px-6 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim transition-all inline-flex items-center gap-2'
const HERO_SECONDARY_CLASS =
  'px-6 py-3 rounded-lg bg-bg-3 text-text-0 text-sm font-medium border border-border-default hover:bg-bg-4 hover:border-border-hover transition-all inline-block'
const CTA_BUTTON_CLASS =
  'px-8 py-3 rounded-lg bg-green text-black text-sm font-semibold hover:bg-green-dim transition-all inline-flex items-center gap-2'

function heroConfig(overrides: Record<string, unknown>): SiteConfig {
  return {
    name: 'Test Site',
    blocks: [
      {
        id: 'hero-1',
        type: 'hero',
        variant: 'centered',
        props: {
          headline: 'Hello',
          subheadline: 'World',
          primaryCta: 'Start',
          ...overrides,
        },
      },
    ],
  }
}

describe('SC-001 — hero primary CTA with a rejected URL', () => {
  it('omits the javascript: href and degrades to the non-anchor element', () => {
    const html = exportSiteToHTML(
      heroConfig({ primaryCtaUrl: 'javascript:alert(1)' })
    )

    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a href="javascript:')
    // Same non-anchor output an empty URL produces today.
    expect(html).toContain(`<span class="${HERO_PRIMARY_CLASS}">Start</span>`)
    expect(html).not.toContain(`<a href="javascript:alert(1)"`)
  })
})

describe('SC-003 — hero primary CTA with a policy-passing URL', () => {
  it('keeps the anchor markup byte-identical for https://x', () => {
    const html = exportSiteToHTML(
      heroConfig({ primaryCtaUrl: 'https://x' })
    )

    expect(html).toContain(
      `<a href="https://x" class="${HERO_PRIMARY_CLASS}">Start</a>`
    )
    // Whole-document byte-identity for the legacy baseline is covered
    // separately by `tests/export-legacy-snapshot.test.ts` (phase-01).
  })
})

describe('SC-004 — settings image URLs use the { image: true } rule', () => {
  it('omits both elements when the sources fail the policy', () => {
    const html = exportSiteToHTML(heroConfig({}), {
      settings: {
        faviconUrl: 'data:image/svg+xml,x',
        ogImageUrl: 'javascript:alert(1)',
      },
    })

    expect(html).not.toContain('rel="icon"')
    expect(html).not.toContain('property="og:image"')
  })

  it('emits both elements when the sources are valid https URLs', () => {
    const html = exportSiteToHTML(heroConfig({}), {
      settings: {
        faviconUrl: 'https://cdn.example.com/favicon.ico',
        ogImageUrl: 'https://cdn.example.com/og.png',
      },
    })

    expect(html).toContain('rel="icon"')
    expect(html).toContain('property="og:image"')
  })
})

describe('SC-001 deny coverage — every renderLink caller', () => {
  it('cta buttonUrl degrades to a non-anchor element', () => {
    const config: SiteConfig = {
      name: 'Test Site',
      blocks: [
        {
          id: 'cta-1',
          type: 'cta',
          variant: 'centered',
          props: { headline: 'Ready', buttonText: 'Go', buttonUrl: 'javascript:alert(1)' },
        },
      ],
    }

    const html = exportSiteToHTML(config)

    expect(html).not.toContain('javascript:')
    expect(html).toContain(`<span class="${CTA_BUTTON_CLASS}">Go</span>`)
  })

  it('hero secondaryCtaUrl degrades to a non-anchor element', () => {
    const html = exportSiteToHTML(
      heroConfig({
        secondaryCta: 'Learn',
        secondaryCtaUrl: 'javascript:alert(1)',
      })
    )

    expect(html).not.toContain('javascript:')
    expect(html).toContain(
      `<span class="${HERO_SECONDARY_CLASS}">Learn</span>`
    )
  })
})
