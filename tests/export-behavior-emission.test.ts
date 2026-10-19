/**
 * Exported-page behavior emission and menu markup.
 *
 * One inline runtime is emitted per page document that contains a navbar or a
 * faq block; a page with neither is byte-identical to the frozen 0.3.2 export.
 * The navbar toggle and its panel are pure markup hooks — the runtime itself is
 * tested separately.
 *
 * Provenance of `fixtures/export-no-behavior-0.3.2.html`: captured from the
 * UNMODIFIED exporter at base commit `81b966d` (0.3.2), BEFORE any edit in this
 * change. Input: `fixtures/export-legacy-corpus/01-blocks-only-every-block-type.json`
 * with its navbar and faq blocks filtered out, plus settings
 * `{ siteName: 'No Behavior', gaId: 'G-NOBEHAVIOR1', posthogKey: 'phc_nobehavior_key' }`.
 * It is a frozen baseline: never hand-edit it and never regenerate it to make a
 * test pass — a mismatch is a real behaviour change that must be explained.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import {
  BEHAVIOR_RUNTIME_SOURCE,
  BEHAVIOR_NOSCRIPT_CSS,
} from '../src/lib/export-behavior-runtime'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const site = (blocks: BlockConfig[]): SiteConfig => ({ name: 'Site', blocks })

/** Hard ceiling for the inline runtime, measured on the exported page. */
const SIZE_CAP_BYTES = 5120

const hero = (id: string): BlockConfig => ({
  id,
  type: 'hero',
  variant: 'centered',
  props: { headline: 'Welcome' },
})

const navbar = (id: string): BlockConfig => ({
  id,
  type: 'navbar',
  variant: 'default',
  props: {
    logo: 'Acme',
    links: [
      { label: 'Product', href: '/product' },
      { label: 'Pricing', href: '/pricing' },
    ],
    ctaText: 'Start',
    ctaUrl: 'https://example.com/start',
  },
})

const faq = (id = 'faq-1'): BlockConfig => ({
  id,
  type: 'faq',
  variant: 'accordion',
  props: { title: 'FAQ', items: [{ question: 'Q?', answer: 'A.' }] },
})

const count = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

describe('menu markup', () => {
  it('gives the hamburger a type, label, expanded state and controlled panel', () => {
    const html = exportSiteToHTML(site([navbar('nav-1')]))
    expect(html).toContain(
      '<button type="button" data-sb-menu-toggle aria-label="Toggle menu" aria-expanded="false" aria-controls="sb_menu_1" class="lg:hidden',
    )
  })

  it('emits the panel as a sibling right after </nav>, collapsed and display-neutral', () => {
    const html = exportSiteToHTML(site([navbar('nav-1')]))
    // Structure + attributes: a sibling block, hidden by default, with the
    // panel hook and a shared link list. Exact class order is not pinned here.
    expect(html).toMatch(/<\/nav>\n  <div id="sb_menu_1" data-sb-menu-panel hidden [^>]*>/)
    expect(html).toContain('<div class="flex flex-col gap-3">')
    // The panel element must carry no unconditional display utility: Tailwind's
    // `[hidden]{display:none}` has the same specificity and loses to `.flex`.
    const openTag = /<div [^>]*data-sb-menu-panel[^>]*>/.exec(html)?.[0] ?? ''
    const classes = /class="([^"]*)"/.exec(openTag)?.[1]?.split(/\s+/) ?? []
    const displayUtilities = ['flex', 'block', 'grid', 'inline', 'hidden']
    for (const cls of displayUtilities) {
      expect(classes, `panel must not carry unconditional .${cls}`).not.toContain(cls)
    }
    expect(classes).toContain('lg:hidden')
  })

  it('reuses the desktop link row in the panel and does not duplicate the CTA', () => {
    const html = exportSiteToHTML(site([navbar('nav-1')]))
    expect(count(html, 'href="/product"')).toBe(2)
    expect(count(html, 'href="/pricing"')).toBe(2)
    expect(count(html, '>Start</a>')).toBe(1)
  })

  it('numbers panel ids per document so two navbars stay independent', () => {
    const html = exportSiteToHTML(site([navbar('nav-1'), hero('h'), navbar('nav-2')]))
    expect(count(html, 'aria-controls="sb_menu_1"')).toBe(1)
    expect(count(html, 'aria-controls="sb_menu_2"')).toBe(1)
    expect(count(html, 'id="sb_menu_1"')).toBe(1)
    expect(count(html, 'id="sb_menu_2"')).toBe(1)
    expect(count(html, 'data-sb-menu-panel hidden')).toBe(2)
  })

  it('pairs each button with the panel it controls', () => {
    const html = exportSiteToHTML(site([navbar('nav-1'), navbar('nav-2')]))
    const controls = [...html.matchAll(/data-sb-menu-toggle[^>]*aria-controls="([^"]+)"/g)].map(
      (m) => m[1],
    )
    expect(controls).toEqual(['sb_menu_1', 'sb_menu_2'])
    for (const id of controls) {
      expect(html).toContain(`<div id="${id}" data-sb-menu-panel hidden`)
    }
  })

  it('restarts panel numbering per document, not per site', () => {
    // A counter hoisted into `exportSitePages` would give page 2 sb_menu_2 and
    // nothing else in the suite would notice.
    const docs = exportSitePages({
      name: 'TwoNavbars',
      pages: [
        { id: 'p1', name: 'A', path: '/', blocks: [navbar('n1')] },
        { id: 'p2', name: 'B', path: '/b', blocks: [navbar('n2')] },
      ],
      blocks: [],
    })
    expect(docs.map((doc) => doc.path)).toEqual(['/', '/b'])
    for (const doc of docs) {
      expect(count(doc.html, 'aria-controls="sb_menu_1"')).toBe(1)
      expect(count(doc.html, 'aria-controls="sb_menu_2"')).toBe(0)
      expect(count(doc.html, 'id="sb_menu_1"')).toBe(1)
    }
  })

  it('still tags the nav root with the block id', () => {
    const html = exportSiteToHTML(site([navbar('nav-1')]))
    expect(html).toContain('<nav id="nav-1"')
    expect(html).not.toContain('<div id="nav-1"')
  })
})

describe('per-page emission', () => {
  const runtimeTags = (html: string): number => count(html, '<script data-sb-runtime>')
  const noscriptTags = (html: string): number => count(html, '<noscript><style>')

  /** One runtime, no external src, verbatim source, within the gzip budget. */
  const expectSingleRuntime = (html: string): void => {
    expect(runtimeTags(html)).toBe(1)
    const match = /<script data-sb-runtime>([\s\S]*?)<\/script>/.exec(html)
    expect(match, 'runtime script not found').not.toBeNull()
    expect(match![1]).toBe(BEHAVIOR_RUNTIME_SOURCE)
    expect(gzipSync(match![1]).length).toBeLessThanOrEqual(SIZE_CAP_BYTES)
    const tag = /<script[^>]*data-sb-runtime[^>]*>/.exec(html)?.[0] ?? ''
    expect(tag).not.toMatch(/\ssrc=/)
  }

  it('emits exactly one inline runtime on a navbar-only page', () => {
    const html = exportSiteToHTML(site([navbar('n')]))
    expectSingleRuntime(html)
    expect(noscriptTags(html)).toBe(1)
    expect(html).not.toContain('toggleFaq')
    expect(html).not.toContain('onclick=')
  })

  it('emits exactly one inline runtime on a faq-only page', () => {
    const html = exportSiteToHTML(site([faq()]))
    expectSingleRuntime(html)
    expect(noscriptTags(html)).toBe(1)
    expect(html).not.toContain('toggleFaq')
    expect(html).not.toContain('onclick=')
  })

  it('emits the runtime once when both blocks are present', () => {
    const html = exportSiteToHTML(site([navbar('n'), faq()]))
    expectSingleRuntime(html)
    expect(noscriptTags(html)).toBe(1)
    expect(html).not.toContain('toggleFaq')
    expect(html).not.toContain('onclick=')
  })

  it('emits nothing on a page with neither block and stays byte-identical to 0.3.2', () => {
    const corpus = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, 'fixtures/export-legacy-corpus/01-blocks-only-every-block-type.json'),
        'utf8',
      ),
    ) as { config: SiteConfig }
    const config: SiteConfig = {
      name: corpus.config.name,
      blocks: (corpus.config.blocks ?? []).filter((b) => b.type !== 'navbar' && b.type !== 'faq'),
    }
    const options = {
      settings: {
        siteName: 'No Behavior',
        gaId: 'G-NOBEHAVIOR1',
        posthogKey: 'phc_nobehavior_key',
      },
    }
    const html = exportSiteToHTML(config, options)
    const golden = readFileSync(
      resolve(import.meta.dirname, 'fixtures/export-no-behavior-0.3.2.html'),
      'utf8',
    )
    expect(html).toBe(golden)
    expect(runtimeTags(html)).toBe(0)
    expect(noscriptTags(html)).toBe(0)
  })

  it('emits per page: only the page with a navbar carries the runtime', () => {
    const docs = exportSitePages({
      name: 'TwoPages',
      pages: [
        { id: 'p1', name: 'Home', path: '/', blocks: [navbar('n'), hero('h1')] },
        { id: 'p2', name: 'About', path: '/about', blocks: [hero('h2')] },
      ],
      blocks: [],
    })
    expect(runtimeTags(docs[0].html)).toBe(1)
    expect(noscriptTags(docs[0].html)).toBe(1)
    expect(runtimeTags(docs[1].html)).toBe(0)
    expect(noscriptTags(docs[1].html)).toBe(0)
  })
})

describe('no-script fallback', () => {
  it('places a noscript stylesheet in the head with the menu and faq overrides', () => {
    const twoItemFaq: BlockConfig = {
      ...faq(),
      props: {
        title: 'FAQ',
        items: [
          { question: 'Q1?', answer: 'First answer.' },
          { question: 'Q2?', answer: 'Second answer.' },
        ],
      },
    }
    const html = exportSiteToHTML(site([navbar('n'), twoItemFaq]))
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<noscript><style>')
    const style = /<noscript><style>([\s\S]*?)<\/style><\/noscript>/.exec(html)?.[1] ?? ''
    expect(style).toBe(BEHAVIOR_NOSCRIPT_CSS)
    // Assert the emitted bytes, not the constant: a script-less visitor must get
    // a hidden hamburger, a stacked panel below lg, and expanded FAQ answers.
    expect(style).toContain('[data-sb-menu-toggle]{display:none!important}')
    expect(style).toContain(
      '@media (max-width:1023.98px){[data-sb-menu-panel]{display:block!important}}',
    )
    expect(style).toContain('.faq-content{max-height:none!important;padding-bottom:1rem!important}')
    // The override must beat the collapsed answer class: the non-first answer
    // is emitted collapsed with a non-important utility.
    expect(html).toContain('faq-content overflow-hidden transition-all duration-200 max-h-0')
    expect(style).toContain('max-height:none!important')
  })
})

describe('legacy corpus emission rule', () => {
  const dir = resolve(import.meta.dirname, 'fixtures/export-legacy-corpus')

  // Independent oracle: the expected emission per frozen entry, not a re-read
  // of the production predicate. A new fixture must be classified here too.
  const EXPECTED_NEEDS: Record<string, boolean> = {
    '01-blocks-only-every-block-type': true,
    '02-blocks-only-empty': false,
    '03-pages-empty-list': false,
    '04-single-page-home': false,
    '05-single-page-home-with-settings': true,
    '06-single-page-home-with-theme': false,
  }

  const readEntry = (slug: string): {
    config: SiteConfig
    options?: { settings?: Record<string, string> }
  } => JSON.parse(readFileSync(resolve(dir, `${slug}.json`), 'utf8'))

  it('every corpus fixture is classified', () => {
    const onDisk = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.replace(/\.json$/, ''))
      .sort()
    expect(onDisk).toEqual(Object.keys(EXPECTED_NEEDS).sort())
    // Without both classes represented, the "exactly when" claim is vacuous.
    expect(Object.values(EXPECTED_NEEDS)).toContain(true)
    expect(Object.values(EXPECTED_NEEDS)).toContain(false)
  })

  it.each(Object.entries(EXPECTED_NEEDS))(
    '%s carries the runtime exactly when it has a navbar or faq',
    (slug, needs) => {
      const entry = readEntry(slug)
      const html = exportSiteToHTML(entry.config, entry.options ?? undefined)
      expect(count(html, '<script data-sb-runtime>')).toBe(needs ? 1 : 0)
      expect(count(html, '<noscript><style>')).toBe(needs ? 1 : 0)
      expect(html).not.toContain('toggleFaq')
    },
  )
})

const HANDLER_RE = /<[a-zA-Z][^>]*[^\w](on[a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi

describe('handler hygiene', () => {
  it('emits no event-handler attributes except the form no-op', () => {
    const contact: BlockConfig = {
      id: 'contact-1',
      type: 'contact',
      variant: 'form',
      props: { title: 'Contact' },
    }
    const html = exportSiteToHTML(site([navbar('n'), faq(), contact]))
    const handlers = [...html.matchAll(HANDLER_RE)].map((m) => m[1].toLowerCase())
    // The allowlist branch must actually be exercised, not vacuously empty.
    expect(handlers).toContain('onsubmit')
    expect(handlers.filter((name) => name !== 'onsubmit')).toEqual([])
  })
})
