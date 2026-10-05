/**
 * SC-011 / SC-012 / NF-003 — the XSS corpus against the six new renderers.
 *
 * Spec: `specs/publish-fidelity/spec.md` NF-003. Phase-03 of the
 * publish-fidelity plan. Modules under test: `src/lib/export-blocks/render-*`
 * and the `exportSiteToHTML` URL sinks.
 *
 * Assertion scoping (intentional): every injection is checked for a raw
 * `<script` tag and for an `on*=` HANDLER inside a real tag — an escaped
 * `onerror=` sitting in TEXT is inert and must not false-positive, so the
 * handler regex only matches `on…=` between a `<tagname` and its `>`. The
 * `javascript:` / `data:` substring checks are applied only where the payload
 * lands in a URL sink (`img src`, `iframe src` via id extraction, `a href`). A
 * scheme payload injected into a TEXT prop is escaped, inert visible text by
 * design (the renderers must not silently mutate content) — it neither becomes
 * an attribute nor executes, so a substring ban there would reject correct
 * output rather than catch an injection.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig, BlockType, SiteConfig } from '../src/blocks/types'
import { renderContent } from '../src/lib/export-blocks/render-content'
import { renderImage } from '../src/lib/export-blocks/render-image'
import { renderVideo } from '../src/lib/export-blocks/render-video'
import { renderGallery } from '../src/lib/export-blocks/render-gallery'
import { renderDivider } from '../src/lib/export-blocks/render-divider'
import { renderBanner } from '../src/lib/export-blocks/render-banner'

const CORPUS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  'javascript:alert(1)',
  '&#106;avascript:alert(1)',
  '"><svg/onload=alert(1)>',
  'data:text/html,<script>alert(1)</script>',
  // Phase-07 widening — the plan's remaining payloads.
  '" onerror="x',
  '">',
  'java\tscript:',
  '//evil.example',
]

/**
 * An `on*=` HANDLER inside a real open tag — not the escaped `onerror=` text an
 * injection degrades to. The char before `on` may be any non-word char, a space
 * OR a `/` (so `<svg/onload=alert(1)>` is caught), while the `[^>]*` run still
 * cannot cross a `>` and the whole thing is anchored on a `<tagname`. Escaped
 * `onerror=` sitting in TEXT has no raw `<tagname` before it, so it cannot
 * false-positive.
 */
const HANDLER_RE = /<[a-zA-Z][^>]*[^\w]on[a-z]+\s*=/i

interface Scenario {
  label: string
  props: Record<string, unknown>
  /** Payload lands in a URL attribute → scheme substring ban applies. */
  urlish?: boolean
}

interface RendererCase {
  type: BlockType
  render: (block: BlockConfig) => string
  variants: string[]
  scenarios: Scenario[]
}

const card = (key: string, value: string): Record<string, unknown> => ({
  [key]: value,
})

const RENDERERS: RendererCase[] = [
  {
    type: 'content',
    render: renderContent,
    variants: ['prose', 'columns', 'highlight'],
    scenarios: CORPUS.map((p) => ({ label: `body=${p}`, props: { body: p } })),
  },
  {
    type: 'image',
    render: renderImage,
    variants: ['hero-image', 'side-by-side', 'grid'],
    scenarios: [
      ...CORPUS.map((p) => ({ label: `src=${p}`, props: { src: p }, urlish: true as const })),
      ...CORPUS.map((p) => ({ label: `alt=${p}`, props: { alt: p } })),
      ...CORPUS.map((p) => ({ label: `title=${p}`, props: { title: p } })),
      ...CORPUS.map((p) => ({ label: `subtitle=${p}`, props: { subtitle: p } })),
      ...CORPUS.map((p) => ({ label: `imageSide=${p}`, props: { imageSide: p } })),
      ...CORPUS.map((p) => ({
        label: `images[].src=${p}`,
        props: { images: [card('src', p)] },
        urlish: true as const,
      })),
      ...CORPUS.map((p) => ({
        label: `images[].alt=${p}`,
        props: { images: [card('alt', p)] },
      })),
    ],
  },
  {
    type: 'video',
    render: renderVideo,
    variants: ['youtube', 'vimeo'],
    scenarios: [
      ...CORPUS.map((p) => ({ label: `url=${p}`, props: { url: p }, urlish: true as const })),
      ...CORPUS.map((p) => ({ label: `title=${p}`, props: { title: p } })),
    ],
  },
  {
    type: 'gallery',
    render: renderGallery,
    variants: ['grid', 'masonry'],
    scenarios: [
      ...CORPUS.map((p) => ({ label: `title=${p}`, props: { title: p } })),
      ...CORPUS.map((p) => ({
        label: `images[].src=${p}`,
        props: { images: [card('src', p)] },
        urlish: true as const,
      })),
      ...CORPUS.map((p) => ({
        label: `images[].alt=${p}`,
        props: { images: [card('alt', p)] },
      })),
      ...CORPUS.map((p) => ({
        label: `images[].caption=${p}`,
        props: { images: [card('caption', p)] },
      })),
    ],
  },
  {
    type: 'divider',
    render: renderDivider,
    variants: ['line', 'space', 'dots'],
    scenarios: [
      ...CORPUS.map((p) => ({ label: `height=${p}`, props: { height: p } })),
      ...CORPUS.map((p) => ({ label: `width=${p}`, props: { width: p } })),
    ],
  },
  {
    type: 'banner',
    render: renderBanner,
    variants: ['ribbon', 'bar'],
    scenarios: [
      ...CORPUS.map((p) => ({ label: `text=${p}`, props: { text: p } })),
      ...CORPUS.map((p) => ({ label: `linkText=${p}`, props: { linkText: p } })),
      ...CORPUS.map((p) => ({
        label: `linkUrl=${p}`,
        props: { linkText: 'Go', linkUrl: p },
        urlish: true as const,
      })),
    ],
  },
]

describe('SC-012 — corpus injected into every prop of every new renderer', () => {
  for (const rc of RENDERERS) {
    describe(rc.type, () => {
      for (const variant of rc.variants) {
        for (const scenario of rc.scenarios) {
          it(`${variant} — ${scenario.label}`, () => {
            const out = rc.render({
              id: 'b',
              type: rc.type,
              variant,
              props: scenario.props,
            })
            const msg = `${rc.type}/${variant} ${scenario.label}`
            expect(out, `${msg}: raw <script`).not.toMatch(/<script/i)
            expect(out, `${msg}: on*= handler`).not.toMatch(HANDLER_RE)
            if (scenario.urlish) {
              expect(out, `${msg}: javascript:`).not.toContain('javascript:')
              expect(out, `${msg}: data:`).not.toContain('data:')
            }
          })
        }
      }
    })
  }
})

describe('SC-011 — rejected URL sinks across the page export', () => {
  function exportBlocks(blocks: SiteConfig['blocks']): string {
    return exportSiteToHTML({ name: 'XSS Sinks', blocks })
  }

  it('image block: a data:image src is not emitted', () => {
    const html = exportBlocks([
      {
        id: 'i',
        type: 'image',
        variant: 'hero-image',
        props: { src: 'data:image/png;base64,AAAA' },
      },
    ])
    expect(html).not.toContain('data:image')
  })

  it('gallery block: a data: item src is not emitted', () => {
    const html = exportBlocks([
      {
        id: 'g',
        type: 'gallery',
        variant: 'grid',
        props: { images: [{ src: 'data:image/png;base64,AAAA' }] },
      },
    ])
    expect(html).not.toContain('data:image')
  })

  it('banner block: a javascript: linkUrl degrades to a non-anchor', () => {
    const html = exportBlocks([
      {
        id: 'b',
        type: 'banner',
        variant: 'ribbon',
        props: { text: 'Hi', linkText: 'Go', linkUrl: 'javascript:alert(1)' },
      },
    ])
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a href="javascript:')
  })

  it('image block: an entity-obfuscated javascript: src degrades to the placeholder', () => {
    const html = exportBlocks([
      {
        id: 'i',
        type: 'image',
        variant: 'hero-image',
        props: { src: '&#106;avascript:alert(1)' },
      },
    ])
    expect(html).not.toContain('src="&#106;avascript:')
    expect(html).not.toContain('src="javascript:')
    // The raw entity form must never reach the output as a live attribute value.
    expect(html).not.toContain('&#106;avascript:')
    // Non-vacuous: rejection degrades to the placeholder, no <img> is emitted.
    expect(html).not.toContain('<img')
    expect(html).toContain('bg-gradient-to-br')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Phase-07 widening (NF-003): the corpus across ALL 19 block types, through the
// real `exportSiteToHTML` path. The raw-renderer matrix above covers the six new
// renderers prop-by-prop; the 13 pre-existing renderers are not individually
// exported, so this section exercises them (and re-exercises the new ones) end
// to end. Together the two sections touch every one of the 19 declared types.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every `on<name>="<value>"` event-handler attribute sitting inside a real open
 * tag. The exporter legitimately emits exactly two of these — the form blocks'
 * `onsubmit="return false"` and the FAQ accordion's `onclick="toggleFaq(this)"`.
 * Those two are filtered out by their EXACT attribute text. Filtering by
 * attribute NAME (as an earlier draft did with a `(?!submit|click)` lookahead)
 * would silently ignore an injected `onclick=`/`onsubmit=` — precisely the kind
 * of payload a corpus-widening pass is expected to add, so the test would go
 * green on a real injection. The escaped `onerror=` text a payload degrades to
 * has no raw `<tagname` before it, so it cannot match. `[^>]*` cannot cross a
 * close bracket, so this only fires in tag position.
 */
// The value may be single-, double-quoted, OR unquoted (`onerror=alert(1)`),
// so the detector is no narrower than the phase-03 raw-renderer check.
const HANDLER_ATTR_RE = /<[a-zA-Z][^>]*[^\w](on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const LEGIT_HANDLER_ATTRS = new Set(['onsubmit="return false"', 'onclick="toggleFaq(this)"'])
const injectedHandlers = (html: string): string[] =>
  [...html.matchAll(HANDLER_ATTR_RE)]
    .map((match) => `${match[1]}=${match[2]}`)
    .filter((attr) => !LEGIT_HANDLER_ATTRS.has(attr))

const countScripts = (html: string): number => (html.match(/<script/gi) ?? []).length

/** Every `attr="value"` inner value in the document. */
const attributeValues = (html: string): string[] =>
  [...html.matchAll(/="([^"]*)"/g)].map((match) => match[1])

/**
 * Payloads whose only danger is structural markup (`">`, `" onerror="x`) are
 * ubiquitous substrings of any HTML document, so they cannot be asserted absent
 * as a raw substring — `">` alone appears at every tag close. What actually
 * matters for them — that they neither open a real event handler nor inject a
 * `<script>` — is asserted separately for every case.
 */
const isSubstringCheckable = (payload: string): boolean =>
  payload.includes('<') || payload.includes(':') || payload.startsWith('//')

interface SinkCase {
  type: BlockType
  variant: string
  sink: string
  withValue: (value: string) => Record<string, unknown>
  /** A policy-passing value the sink accepts. */
  okValue: string
  /** Substring present when `okValue` is used (proves the sink renders). */
  okMarker: string
}

const URL_SUFFIX = 'https://ok.example/x'
const IMG_SUFFIX = 'https://ok.example/x.png'

/** Every URL-emitting prop across the 19 block types (FR-001, NF-003). */
const URL_SINKS: SinkCase[] = [
  { type: 'navbar', variant: 'default', sink: 'ctaUrl', withValue: (v) => ({ logo: 'Acme', links: [], ctaText: 'Go', ctaUrl: v }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'navbar', variant: 'default', sink: 'logoImage', withValue: (v) => ({ logo: 'Acme', links: [], logoImage: v }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'navbar', variant: 'default', sink: 'links[].href', withValue: (v) => ({ links: [{ label: 'L', href: v }] }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'hero', variant: 'centered', sink: 'primaryCtaUrl', withValue: (v) => ({ headline: 'H', primaryCta: 'Go', primaryCtaUrl: v }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'hero', variant: 'centered', sink: 'secondaryCtaUrl', withValue: (v) => ({ headline: 'H', secondaryCta: 'More', secondaryCtaUrl: v }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'hero', variant: 'split', sink: 'heroImage', withValue: (v) => ({ headline: 'H', heroImage: v }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'cta', variant: 'simple', sink: 'buttonUrl', withValue: (v) => ({ headline: 'H', buttonText: 'Go', buttonUrl: v }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'pricing', variant: 'simple', sink: 'tiers[].ctaUrl', withValue: (v) => ({ tiers: [{ name: 'T', price: '$1', features: ['a'], cta: 'Buy', ctaUrl: v }] }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'footer', variant: 'simple', sink: 'logoImage', withValue: (v) => ({ logo: 'Acme', logoImage: v, links: [] }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'footer', variant: 'simple', sink: 'links[].href', withValue: (v) => ({ logo: 'Acme', links: [{ label: 'L', href: v }] }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'footer', variant: 'multi-column', sink: 'columns[].links[].href', withValue: (v) => ({ logo: 'Acme', links: [], columns: [{ title: 'C', links: [{ label: 'L', href: v }] }] }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'testimonials', variant: 'cards', sink: 'items[].avatar', withValue: (v) => ({ items: [{ quote: 'Q', name: 'N', avatar: v }] }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'team', variant: 'grid', sink: 'members[].avatar', withValue: (v) => ({ members: [{ name: 'N', role: 'R', avatar: v }] }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'image', variant: 'hero-image', sink: 'src', withValue: (v) => ({ src: v }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'image', variant: 'grid', sink: 'images[].src', withValue: (v) => ({ images: [{ src: v, alt: 'a' }] }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'video', variant: 'youtube', sink: 'url', withValue: (v) => ({ url: v }), okValue: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', okMarker: 'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"' },
  { type: 'gallery', variant: 'grid', sink: 'images[].src', withValue: (v) => ({ images: [{ src: v, alt: 'a' }] }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'banner', variant: 'ribbon', sink: 'linkUrl', withValue: (v) => ({ text: 'T', linkText: 'Go', linkUrl: v }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
]

describe('SC-012 (widened) / NF-003 — URL sinks across every renderer, via exportSiteToHTML', () => {
  const exportBlock = (sink: SinkCase, value: string): string =>
    exportSiteToHTML({
      name: 'XSS',
      blocks: [{ id: 'x', type: sink.type, variant: sink.variant, props: sink.withValue(value) }],
    })

  describe('positive control — each sink renders a policy-passing URL (non-vacuous)', () => {
    for (const sink of URL_SINKS) {
      it(`${sink.type}/${sink.variant} — ${sink.sink}`, () => {
        const html = exportBlock(sink, sink.okValue)
        expect(html, `${sink.type} did not render`).not.toContain('Unknown block type')
        expect(html).toContain(sink.okMarker)
      })
    }
  })

  describe('negative — each sink neutralizes every corpus payload', () => {
    for (const sink of URL_SINKS) {
      for (const payload of CORPUS) {
        it(`${sink.type}/${sink.variant} — ${sink.sink} ← ${JSON.stringify(payload)}`, () => {
          const html = exportBlock(sink, payload)
          const msg = `${sink.type}/${sink.variant} ${sink.sink} ← ${payload}`
          // The renderer still produced its block (a payload must not blank it).
          expect(html, `${msg}: renderer blanked`).not.toContain('Unknown block type')
          // No injected event handler reached a tag position.
          expect(injectedHandlers(html), `${msg}: injected handler`).toEqual([])
          // The rejected value never landed in any attribute value.
          expect(attributeValues(html), `${msg}: payload in an attribute`).not.toContain(payload)
          // No <script> element was injected (differential vs a clean export).
          expect(countScripts(html), `${msg}: injected script`).toBe(
            countScripts(exportBlock(sink, sink.okValue))
          )
          if (isSubstringCheckable(payload)) {
            expect(html, `${msg}: payload substring present`).not.toContain(payload)
          }
        })
      }
    }
  })
})

interface TextCase {
  type: BlockType
  variant: string
  prop: string
  withValue: (value: string) => Record<string, unknown>
}

/**
 * The seven remaining block types that carry a real text prop — injecting the
 * corpus into a representative one. `divider` (the eighth no-URL type) has no
 * string prop that reaches output at all: `height` is coerced numerically and
 * `width` maps through a fixed allow-list, so it is asserted separately by
 * coercion below rather than vacuously here. Together with the 11 URL-sink
 * types and `divider`, all 19 declared types are exercised.
 */
const TEXT_CASES: TextCase[] = [
  { type: 'features', variant: 'grid', prop: 'title', withValue: (v) => ({ title: v, items: [{ title: 'T', description: 'D' }] }) },
  { type: 'stats', variant: 'grid', prop: 'title', withValue: (v) => ({ title: v, items: [{ label: 'L', value: '1' }] }) },
  { type: 'faq', variant: 'accordion', prop: 'title', withValue: (v) => ({ title: v, items: [{ question: 'Q', answer: 'A' }] }) },
  { type: 'contact', variant: 'form', prop: 'title', withValue: (v) => ({ title: v, subtitle: 'S' }) },
  { type: 'newsletter', variant: 'simple', prop: 'title', withValue: (v) => ({ title: v, subtitle: 'S' }) },
  { type: 'logocloud', variant: 'default', prop: 'title', withValue: (v) => ({ title: v, logos: ['A', 'B'] }) },
  { type: 'content', variant: 'prose', prop: 'body', withValue: (v) => ({ body: v }) },
]

describe('SC-012 (widened) / NF-003 — text/structural props of the remaining types', () => {
  for (const tc of TEXT_CASES) {
    for (const payload of CORPUS) {
      it(`${tc.type}/${tc.variant} — ${tc.prop} ← ${JSON.stringify(payload)}`, () => {
        const clean = exportSiteToHTML({
          name: 'XSS',
          blocks: [{ id: 'x', type: tc.type, variant: tc.variant, props: {} }],
        })
        const html = exportSiteToHTML({
          name: 'XSS',
          blocks: [{ id: 'x', type: tc.type, variant: tc.variant, props: tc.withValue(payload) }],
        })
        const msg = `${tc.type}/${tc.variant} ${tc.prop} ← ${payload}`
        expect(html, `${msg}: renderer blanked`).not.toContain('Unknown block type')
        // Escaped text is inert; only a handler in a real tag or a new <script>
        // is executable output.
        expect(injectedHandlers(html), `${msg}: injected handler`).toEqual([])
        expect(countScripts(html), `${msg}: injected script`).toBe(countScripts(clean))
        // A text prop renders its value as visible text, so a payload with no
        // markup character (`javascript:…`, `//evil.example`) legitimately
        // survives verbatim — inert, not executable. Only a payload containing
        // `<` must have been escaped, so only that one is asserted absent raw.
        if (payload.includes('<')) {
          expect(html, `${msg}: raw payload present`).not.toContain(payload)
        }
      })
    }
  }
})

describe('SC-012 (widened) / NF-003 — divider coerces, never emits', () => {
  // `divider` has no string prop that reaches output: `height` is coerced with
  // `Number(...) || 60` and `width` maps through a fixed allow-list. Its claim
  // is therefore coercion, asserted directly — an "inject and assert absent"
  // case for this renderer would pass no matter the payload (review finding M1).
  const render = (props: Record<string, unknown>): string =>
    exportSiteToHTML({
      name: 'XSS',
      blocks: [{ id: 'x', type: 'divider', variant: 'line', props }],
    })

  it('a payload in height coerces to the default 60px and never appears', () => {
    for (const payload of CORPUS) {
      const html = render({ height: payload, width: 'full' })
      expect(html).not.toContain('Unknown block type')
      expect(html).toContain('min-height: 60px')
      if (isSubstringCheckable(payload)) expect(html).not.toContain(payload)
    }
  })

  it('a payload in width maps to the fixed w-full class and never appears', () => {
    for (const payload of CORPUS) {
      const html = render({ width: payload, height: 40 })
      expect(html).toContain('min-height: 40px')
      expect(html).toContain('w-full')
      // A payload that happens to spell a real width token must not be
      // reachable — the allow-list only accepts the exact two literals.
      if (isSubstringCheckable(payload)) expect(html).not.toContain(payload)
    }
  })
})

describe('injectedHandlers detector — self-test (guards the guard)', () => {
  // The matrix is only as strong as this filter. If it regressed to ignoring
  // `onclick=`/`onsubmit=` by NAME, an injected instance would slip through
  // every negative case while the suite stayed green (review finding M2).
  it('ignores only the exporter\'s own two handler literals', () => {
    expect(injectedHandlers('<a href="x" onclick="toggleFaq(this)">L</a>')).toEqual([])
    expect(injectedHandlers('<form onsubmit="return false">')).toEqual([])
  })

  it('flags an injected onclick/onsubmit with any other value', () => {
    expect(injectedHandlers('<a href="" onclick="alert(1)">L</a>')).toEqual(['onclick="alert(1)"'])
    expect(injectedHandlers('<form onsubmit="doStuff()">')).toEqual(['onsubmit="doStuff()"'])
  })

  it('flags the classic injected handlers, including the no-space svg form', () => {
    expect(injectedHandlers('<img src="x" onerror="alert(1)">')).toEqual(['onerror="alert(1)"'])
    expect(injectedHandlers('<svg/onload="alert(1)">')).toEqual(['onload="alert(1)"'])
  })

  it('flags unquoted handlers too (no narrowing vs the phase-03 raw check)', () => {
    // The value may be unquoted; a detector that only matched `="…"` would be
    // narrower than the phase-03 HANDLER_RE and blind to this class.
    expect(injectedHandlers('<img src=x onerror=alert(1)>')).toEqual(['onerror=alert(1)'])
  })
})
