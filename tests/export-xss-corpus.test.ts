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
