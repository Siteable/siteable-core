/**
 * The XSS corpus against the export-block renderers.
 *
 * Modules under test: `src/lib/export-blocks/render-*`
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
import { EXPORT_XSS_CORPUS } from './helpers/injection-corpus'
import { BEHAVIOR_RUNTIME_SOURCE } from '../src/lib/export-behavior-runtime'
import type { BlockConfig, BlockType, SiteConfig } from '../src/blocks/types'
import { renderContent } from '../src/lib/export-blocks/render-content'
import { renderImage } from '../src/lib/export-blocks/render-image'
import { renderVideo } from '../src/lib/export-blocks/render-video'
import { renderGallery } from '../src/lib/export-blocks/render-gallery'
import { renderCardGrid } from '../src/lib/export-blocks/render-card-grid'
import { renderDivider } from '../src/lib/export-blocks/render-divider'
import { renderBanner } from '../src/lib/export-blocks/render-banner'

const CORPUS = EXPORT_XSS_CORPUS

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
  {
    type: 'card-grid',
    render: renderCardGrid,
    variants: ['product'],
    scenarios: [
      ...CORPUS.map((p) => ({ label: `title=${p}`, props: { title: p, items: [{ name: 'One' }] } })),
      ...CORPUS.map((p) => ({
        label: `subtitle=${p}`,
        props: { subtitle: p, items: [{ name: 'One' }] },
      })),
      ...CORPUS.map((p) => ({
        label: `items[].image=${p}`,
        props: { items: [{ image: p, name: 'One' }] },
        urlish: true as const,
      })),
      // `alt` is deliberately NOT a raw-matrix row: it only reaches output inside
      // a real tag's attribute, where this matrix's handler regex reads the
      // escaped payload as tag text. A no-image row would be vacuous instead, so
      // the attribute position gets its own document-level test below.
      ...CORPUS.map((p) => ({ label: `items[].name=${p}`, props: { items: [{ name: p }] } })),
      ...CORPUS.map((p) => ({
        label: `items[].description=${p}`,
        props: { items: [{ name: 'One', description: p }] },
      })),
      ...CORPUS.map((p) => ({ label: `items[].price=${p}`, props: { items: [{ name: 'One', price: p }] } })),
      ...CORPUS.map((p) => ({
        label: `items[].category=${p}`,
        props: { items: [{ name: 'One', category: p }] },
      })),
      ...CORPUS.map((p) => ({
        label: `items[].ctaText=${p}`,
        props: { items: [{ name: 'One', ctaText: p, ctaUrl: 'https://ok.example/x' }] },
      })),
    ],
  },
]

describe('corpus injected into every prop of every new renderer', () => {
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

describe('rejected URL sinks across the page export', () => {
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
// Widening: the corpus across ALL 20 block types, through the
// real `exportSiteToHTML` path. The raw-renderer matrix above covers the seven
// individually exported renderers prop-by-prop; the rest are not individually
// exported, so this section exercises them (and re-exercises the new ones) end
// to end. Together the two sections touch every one of the 20 declared types.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Every `on<name>="<value>"` event-handler attribute sitting inside a real open
 * tag. The exporter legitimately emits exactly ONE of these — the form blocks'
 * `onsubmit="return false"`. It is filtered out by its EXACT attribute text.
 * Filtering by attribute NAME (as an earlier draft did with a
 * `(?!submit|click)` lookahead) would silently ignore an injected
 * `onclick=`/`onsubmit=` — precisely the kind of payload a corpus-widening pass
 * is expected to add, so the test would go green on a real injection. The
 * escaped `onerror=` text a payload degrades to has no raw `<tagname` before it,
 * so it cannot match. `[^>]*` cannot cross a close bracket, so this only fires
 * in tag position.
 */
// The value may be single-, double-quoted, OR unquoted (`onerror=alert(1)`),
// so the detector is no narrower than the raw-renderer check.
const HANDLER_ATTR_RE = /<[a-zA-Z][^>]*[^\w](on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const LEGIT_HANDLER_ATTRS = new Set(['onsubmit="return false"'])
// The font link's fixed inline onload is the ONLY permitted head addition that
// looks like a handler. That exact literal is removed from the RAW document
// before scanning (nothing else is normalized, so a breakout out of the
// structured-data script stays visible to every scan below).
const FONT_ONLOAD_LITERAL = `onload="this.onload=null;this.rel='stylesheet'"`
const withoutFontOnload = (html: string): string => html.split(FONT_ONLOAD_LITERAL).join('')
const injectedHandlers = (html: string): string[] =>
  [...withoutFontOnload(html).matchAll(HANDLER_ATTR_RE)]
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

/** Every URL-emitting prop across the 20 block types. */
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
  { type: 'card-grid', variant: 'product', sink: 'items[].image', withValue: (v) => ({ items: [{ name: 'One', image: v }] }), okValue: IMG_SUFFIX, okMarker: `src="${IMG_SUFFIX}"` },
  { type: 'card-grid', variant: 'product', sink: 'items[].ctaUrl', withValue: (v) => ({ items: [{ name: 'One', ctaText: 'View', ctaUrl: v }] }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
  { type: 'banner', variant: 'ribbon', sink: 'linkUrl', withValue: (v) => ({ text: 'T', linkText: 'Go', linkUrl: v }), okValue: URL_SUFFIX, okMarker: `href="${URL_SUFFIX}"` },
]

describe('URL sinks across every renderer, via exportSiteToHTML', () => {
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
 * coercion below rather than vacuously here. Together with the 12 URL-sink
 * types and `divider`, all 20 declared types are exercised.
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

describe('text/structural props of the remaining types', () => {
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

/**
 * The features label is a text run in the DEFAULT renderer too (grid and list
 * share the same header shape). It is asserted on its own so a dropped escape
 * here fails with a precise cause rather than only as a whole-document scan.
 *
 * `escapeLabel` is a test-local oracle: deriving the expectation from
 * `escapeHtml` would make the assertion move with the implementation.
 */
describe('the features block label is escaped in both default variants', () => {
  const LABEL_DIV_RE = /<div class="text-\[11px\][^"]*">([\s\S]*?)<\/div>/
  const escapeLabel = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const render = (variant: string, label: string): string =>
    exportSiteToHTML({
      name: 'XSS',
      blocks: [
        {
          id: 'f',
          type: 'features',
          variant,
          props: { label, items: [{ title: 'T', description: 'D' }] },
        },
      ],
    })

  for (const variant of ['grid', 'list']) {
    for (const payload of CORPUS) {
      it(`${variant} — label ← ${JSON.stringify(payload)}`, () => {
        const html = render(variant, payload)
        const msg = `${variant} — label ← ${payload}`

        expect(html, `${msg}: renderer blanked`).not.toContain('Unknown block type')
        expect(injectedHandlers(html), `${msg}: injected handler`).toEqual([])
        expect(LABEL_DIV_RE.exec(html)?.[1], `${msg}: label bytes`).toBe(
          escapeLabel(payload),
        )
        if (payload.includes('<')) {
          expect(html, `${msg}: raw payload present`).not.toContain(payload)
        }
      })
    }
  }
})

describe('divider coerces, never emits', () => {
  // `divider` has no string prop that reaches output: `height` is coerced with
  // `Number(...) || 60` and `width` maps through a fixed allow-list. Its claim
  // is therefore coercion, asserted directly — an "inject and assert absent"
  // case for this renderer would pass no matter the payload.
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
  // every negative case while the suite stayed green.
  it('ignores only the exporter\'s own form no-op handler literal', () => {
    expect(injectedHandlers('<form onsubmit="return false">')).toEqual([])
  })

  it('flags the retired FAQ onclick like any other injected handler', () => {
    // The FAQ no longer emits an inline handler; the allowlist must not keep a
    // slot for it, or this exact payload would pass unnoticed.
    expect(injectedHandlers('<a href="x" onclick="toggleFaq(this)">L</a>')).toEqual([
      'onclick="toggleFaq(this)"',
    ])
  })

  it('finds no handler attributes in the emitted runtime source', () => {
    // The whole-document scan sees the inline runtime on every navbar/faq page.
    // This guard proves the runtime never contributes a match, so a future
    // runtime edit that added one fails here (with a precise cause) rather than
    // as a mysterious injected-handler failure elsewhere.
    expect(injectedHandlers(BEHAVIOR_RUNTIME_SOURCE)).toEqual([])
  })

  it('flags an injected onclick/onsubmit with any other value', () => {
    expect(injectedHandlers('<a href="" onclick="alert(1)">L</a>')).toEqual(['onclick="alert(1)"'])
    expect(injectedHandlers('<form onsubmit="doStuff()">')).toEqual(['onsubmit="doStuff()"'])
  })

  it('flags the classic injected handlers, including the no-space svg form', () => {
    expect(injectedHandlers('<img src="x" onerror="alert(1)">')).toEqual(['onerror="alert(1)"'])
    expect(injectedHandlers('<svg/onload="alert(1)">')).toEqual(['onload="alert(1)"'])
  })

  it('flags unquoted handlers too (no narrowing vs the raw check)', () => {
    // The value may be unquoted; a detector that only matched `="…"` would be
    // narrower than HANDLER_RE and blind to this class.
    expect(injectedHandlers('<img src=x onerror=alert(1)>')).toEqual(['onerror=alert(1)'])
  })
})

// The menu panel renders a SECOND copy of every navbar link. The URL-sink matrix
// above already sees that copy through its whole-document scans; what this block
// uniquely proves is that the panel's LABEL is escaped (twice over), which a
// regression unescaping only the panel copy would leave untested.
describe('the menu panel copy is escaped like the desktop row', () => {
  const exportNavbar = (props: Record<string, unknown>): string =>
    exportSiteToHTML({
      name: 'XSS',
      blocks: [{ id: 'x', type: 'navbar', variant: 'default', props }],
    })

  it('renders an escaped label identically in the desktop row and the panel', () => {
    const html = exportNavbar({ logo: 'A', links: [{ label: '<b>L</b>', href: '/x' }] })
    expect((html.match(/&lt;b&gt;L&lt;\/b&gt;/g) ?? []).length).toBe(2)
    expect(html).not.toContain('<b>L</b>')
  })

  it.each(CORPUS)('keeps both copies inert for payload %s', (payload) => {
    const html = exportNavbar({
      logo: 'A',
      links: [{ label: payload, href: payload }],
    })
    expect(html).toContain('data-sb-menu-panel')
    expect(injectedHandlers(html)).toEqual([])
    // A payload containing markup never opens a real script tag.
    if (payload.includes('<')) expect(html).not.toContain(payload)
  })
})

// The card grid image `alt` reaches output only inside an attribute, which the
// raw-renderer matrix cannot judge: its handler regex reads the escaped payload
// as tag text, and a no-image row would be vacuous. This test pins the
// serialized attribute against a local oracle instead. `[^"]*` cannot cross a
// quote, so an escaping failure both truncates the capture and reveals a
// breakout, making the assertion fail on the real defect rather than on a
// heuristic.
describe('the card grid image alt is escaped in the attribute position', () => {
  const IMG_ALT_RE = /<img\b[^>]*\balt="([^"]*)"/
  const escapeAttr = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  /**
   * Handler attributes on the PARSED document. The regex scanner used above
   * cannot judge this position: an escaped payload sitting in a quoted
   * attribute value reads as raw tag text to a regex, while the parser keeps it
   * inside the attribute. A real handler is an attribute NAME.
   */
  const handlerAttributes = (html: string): string[] => {
    const names: string[] = []
    for (const element of new DOMParser().parseFromString(withoutFontOnload(html), 'text/html').querySelectorAll('*')) {
      for (const attribute of [...element.attributes]) {
        if (/^on/i.test(attribute.name)) names.push(`${element.tagName}.${attribute.name}`)
      }
    }
    return names
  }

  const render = (alt: string): string =>
    exportSiteToHTML({
      name: 'XSS',
      blocks: [
        {
          id: 'c',
          type: 'card-grid',
          variant: 'product',
          props: { items: [{ image: 'https://ok.example/x.png', alt, name: 'One' }] },
        },
      ],
    })

  for (const payload of CORPUS) {
    it(`items[].alt ← ${JSON.stringify(payload)}`, () => {
      const html = render(payload)
      const msg = `items[].alt ← ${payload}`
      expect(html, `${msg}: renderer blanked`).not.toContain('Unknown block type')
      expect(handlerAttributes(html), `${msg}: injected handler`).toEqual([])
      expect(countScripts(html), `${msg}: injected script`).toBe(countScripts(render('clean alt')))
      expect(IMG_ALT_RE.exec(html)?.[1], `${msg}: attribute bytes`).toBe(escapeAttr(payload))
    })
  }
})

describe('structured data stays inert for every corpus payload (raw document scan)', () => {
  // Site name, FAQ text and the logo URL all flow into the JSON-LD script. The
  // RAW document is scanned (no head normalization), so a payload that closes
  // the script element or opens a comment shows up as an extra script.
  const render = (payload: string): string =>
    exportSiteToHTML({
      name: payload,
      blocks: [
        { id: 'n', type: 'navbar', variant: 'simple', props: { logo: 'Brand', logoImage: `https://ok.example/${payload}.png` } },
        { id: 'f', type: 'faq', variant: 'accordion', props: { items: [{ question: payload, answer: payload }] } },
      ],
    })
  const clean = render('clean')

  it('positive control — the clean render carries exactly one structured-data script', () => {
    expect(clean.match(/<script type="application\/ld\+json">/g)).toHaveLength(1)
  })

  for (const payload of CORPUS) {
    it(`payload ${JSON.stringify(payload)} neither adds a script nor opens a handler`, () => {
      const html = render(payload)
      expect(html.match(/<script type="application\/ld\+json">/g)).toHaveLength(1)
      expect(countScripts(html), 'injected script').toBe(countScripts(clean))
      expect((html.match(/<\/script/gi) ?? []).length, 'script closers').toBe((clean.match(/<\/script/gi) ?? []).length)
      // Judged on the PARSED document: escaped payload text inside a quoted
      // attribute (og:title and friends) is inert, a real handler is a name.
      const handlers: string[] = []
      for (const element of new DOMParser().parseFromString(withoutFontOnload(html), 'text/html').querySelectorAll('*')) {
        for (const attribute of [...element.attributes]) {
          if (/^on/i.test(attribute.name)) handlers.push(`${element.tagName}.${attribute.name}`)
        }
      }
      expect(handlers).toEqual([])
    })
  }
})
