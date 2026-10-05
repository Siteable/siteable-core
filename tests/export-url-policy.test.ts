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

describe('SC-004 — settings image URLs are policy-gated', () => {
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

  // These two cases are the reason favicon/og use the GENERAL policy rather than
  // the https-only image rule: both are pre-existing settings on published
  // sites, and the strict rule silently dropped them on republish. The frozen
  // legacy fixture cannot catch this — it uses absolute https URLs throughout.
  it('keeps a relative favicon and og-image (a published site must not lose them)', () => {
    const html = exportSiteToHTML(heroConfig({}), {
      settings: { faviconUrl: '/favicon.ico', ogImageUrl: '/og.png' },
    })

    expect(html).toContain('href="/favicon.ico"')
    expect(html).toContain('content="/og.png"')
  })

  it('keeps an http: favicon and og-image', () => {
    const html = exportSiteToHTML(heroConfig({}), {
      settings: {
        faviconUrl: 'http://cdn.example.com/favicon.ico',
        ogImageUrl: 'http://cdn.example.com/og.png',
      },
    })

    expect(html).toContain('href="http://cdn.example.com/favicon.ico"')
    expect(html).toContain('content="http://cdn.example.com/og.png"')
  })

  it('still rejects the dangerous schemes the general policy denies', () => {
    for (const bad of ['vbscript:x', '//evil.example/f.ico', 'java\tscript:x']) {
      const html = exportSiteToHTML(heroConfig({}), {
        settings: { faviconUrl: bad, ogImageUrl: bad },
      })
      expect(html).not.toContain('rel="icon"')
      expect(html).not.toContain('property="og:image"')
    }
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

/**
 * FR-001 general URL-policy scope — the six PRE-EXISTING `<img src>` emitters
 * are gated through the GENERAL policy `isAllowedUrl(x)` (no `{ image: true }`),
 * per the FC1 correction. An `<img src>` cannot execute `javascript:` or `data:`,
 * and the https-only image rule bought ~zero security while dropping legacy
 * relative/http image values — so these emitters must accept `https:`, `http:`
 * and relative paths, and still deny script-bearing and blank values.
 *
 * The `{ image: true }` https-only rule remains for the NEW `image`/`gallery`
 * renderers and for `faviconUrl`/`ogImageUrl` (spec FR-004 image rule) — covered
 * by the SC-004 settings tests above and the XSS corpus, not here.
 *
 * One minimal single-block config per emitter, so a single `<img src=` in the
 * document can only come from the emitter under test.
 */
const GENERAL_PASS_IMAGES: { label: string; value: string }[] = [
  { label: 'https', value: 'https://cdn.example.com/x.png' },
  { label: 'http', value: 'http://cdn.example.com/x.png' },
  { label: 'relative', value: '/img/logo.png' },
  { label: 'dot-relative', value: './x.jpg' },
]
/**
 * Denied values under the general policy: the script-bearing schemes that must
 * never reach a `src` (`javascript:`, `data:`) plus a whitespace-only blank.
 * `http:`/relative are intentionally NOT here — they are now allowed.
 */
const GENERAL_REJECTED_IMAGES: { label: string; value: string }[] = [
  { label: 'javascript:', value: 'javascript:alert(1)' },
  { label: 'data:', value: 'data:image/png;base64,AAAA' },
  { label: 'whitespace', value: '   ' },
]

const gatedEmitters: { name: string; config: (image: string) => SiteConfig }[] = [
  {
    name: 'navbar logoImage',
    config: (image) => ({
      name: 'Test Site',
      blocks: [
        { id: 'navbar-1', type: 'navbar', variant: 'default', props: { links: ['A'], logoImage: image } },
      ],
    }),
  },
  {
    name: 'footer-simple logoImage',
    config: (image) => ({
      name: 'Test Site',
      blocks: [
        { id: 'footer-1', type: 'footer', variant: 'default', props: { links: ['A'], logoImage: image } },
      ],
    }),
  },
  {
    name: 'footer multi-column logoImage',
    config: (image) => ({
      name: 'Test Site',
      blocks: [
        { id: 'footer-2', type: 'footer', variant: 'multi-column', props: { links: ['A'], logoImage: image } },
      ],
    }),
  },
  {
    name: 'hero-split heroImage',
    config: (image) => ({
      name: 'Test Site',
      blocks: [
        { id: 'hero-2', type: 'hero', variant: 'split', props: { headline: 'Hi', heroImage: image } },
      ],
    }),
  },
  {
    name: 'testimonials item avatar',
    config: (image) => ({
      name: 'Test Site',
      blocks: [
        {
          id: 'testimonials-1',
          type: 'testimonials',
          variant: 'grid',
          props: { items: [{ quote: 'Great', name: 'Ada', role: 'Engineer', avatar: image }] },
        },
      ],
    }),
  },
  {
    name: 'team member avatar',
    config: (image) => ({
      name: 'Test Site',
      blocks: [
        {
          id: 'team-1',
          type: 'team',
          variant: 'grid',
          props: { members: [{ name: 'Ada', role: 'Engineer', avatar: image }] },
        },
      ],
    }),
  },
]

describe('FR-001 — every pre-existing <img src> emitter uses the general URL policy', () => {
  for (const emitter of gatedEmitters) {
    for (const pass of GENERAL_PASS_IMAGES) {
      it(`${emitter.name}: emits an <img> for a ${pass.label} value`, () => {
        const html = exportSiteToHTML(emitter.config(pass.value))

        expect(html).toContain(`<img src="${pass.value}"`)
      })
    }
  }

  for (const emitter of gatedEmitters) {
    for (const rejected of GENERAL_REJECTED_IMAGES) {
      it(`${emitter.name}: rejects a ${rejected.label} value and renders the non-image fallback`, () => {
        const html = exportSiteToHTML(emitter.config(rejected.value))

        // The config holds exactly one block, so this is the only `<img>`
        // emitter in the document: the absence of ANY `<img src=` proves the
        // legacy value degraded to the block's non-image fallback and never
        // reached a `src` attribute.
        expect(html).not.toContain('<img src=')
        // Attribute context: the value never survives into an `="..."` slot.
        expect(html).not.toContain(`="${rejected.value}"`)
        // Plain-substring absence. Skipped for the whitespace-only probe: three
        // spaces trivially occur in the template's own indentation, so the bare
        // substring check proves nothing there — the `<img src=` ban above is
        // the load-bearing assertion for that case.
        if (rejected.value.trim() !== '') {
          expect(html).not.toContain(rejected.value)
        }
      })
    }
  }
})

/**
 * Documented boundary — the general policy's breadth on these six emitters.
 *
 * FC1 mandates the GENERAL `isAllowedUrl(x)` for these six pre-existing emitters,
 * so the full link allow-list reaches the `src`: `mailto:`, `tel:` and a bare
 * `#fragment` are admitted and render an inert, broken `<img>` rather than the
 * initials/logo fallback. That is a deliberate consequence of the mandate, not a
 * security hole — neither scheme executes, and `escapeHtml` still neutralizes the
 * value. Recorded here so the widened surface is provably intentional: only the
 * script-bearing schemes, control characters, and authority-escape forms are denied
 * (asserted above). Tightening to `http:`/`https:` + relative is a deliberate
 * non-goal of FC1 — it would re-break the operator's general-policy mandate.
 */
const GENERAL_INERT_IMAGES: { label: string; value: string }[] = [
  { label: 'mailto:', value: 'mailto:a@b.com' },
  { label: 'tel:', value: 'tel:+15551234' },
  { label: 'fragment', value: '#anchor' },
]

describe('FR-001 — general-policy breadth on the six emitters (documented inert boundary)', () => {
  for (const emitter of gatedEmitters) {
    for (const inert of GENERAL_INERT_IMAGES) {
      it(`${emitter.name}: admits a ${inert.label} value (inert in <img>, general-policy breadth)`, () => {
        const html = exportSiteToHTML(emitter.config(inert.value))

        // The value is admitted verbatim into the src — proving the general
        // policy's breadth reaches these emitters. It renders an inert, broken
        // <img> (these schemes never resolve to image bytes); no script runs.
        expect(html).toContain(`<img src="${inert.value}"`)
      })
    }
  }
})
