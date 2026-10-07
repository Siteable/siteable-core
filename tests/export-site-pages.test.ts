/**
 * FR-001 — multi-page export. Covers SC-001 (page isolation + single-doc == `/`)
 * and SC-002 / NF-001 (legacy byte-identity against the frozen 0.2.0 corpus).
 *
 * The corpus under `tests/fixtures/export-legacy-corpus/` was rendered by
 * `exportSiteToHTML` on a `git worktree` of tag v0.2.1, BEFORE any production
 * edit in this phase, from the `*.json` configs sitting beside it; the same
 * generator run against tag v0.2.0 produced byte-identical files, which is what
 * records the 0.2.0 === 0.2.1 claim the spec's NF-001 baseline rests on. The
 * generator script was deleted afterwards, exactly like
 * `export-legacy-snapshot.test.ts`. Regenerating these files to make a test
 * pass defeats the entire fixture — do not.
 *
 * Re-run the cross-check from a clean tree:
 *   git worktree add /tmp/core-v021 v0.2.1 && git worktree add /tmp/core-v020 v0.2.0
 *   # in each worktree: npm ci, copy tests/fixtures/export-legacy-corpus/*.json
 *   # plus the generator, render each config with OUT_DIR set to a scratch dir
 *   diff -r /tmp/out-020 /tmp/out-021        # must be empty
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const CORPUS_DIR = resolve(import.meta.dirname, 'fixtures/export-legacy-corpus')

type CorpusEntry = {
  slug: string
  config: SiteConfig
  options: { settings?: Record<string, string> } | null
}

function corpus(): CorpusEntry[] {
  return readdirSync(CORPUS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(readFileSync(resolve(CORPUS_DIR, file), 'utf8')))
}

function snapshot(slug: string): string {
  return readFileSync(resolve(CORPUS_DIR, `${slug}.html`), 'utf8')
}

/** Unique per-block text, so "contains only its own page's markup" is checkable. */
function marker(label: string): string {
  return `MARKER_${label}_7f3a`
}

const homeBlocks: BlockConfig[] = [
  { id: 'home-hero', type: 'hero', variant: 'centered', props: { headline: marker('HOME') } },
]
const aboutBlocks: BlockConfig[] = [
  { id: 'about-hero', type: 'hero', variant: 'split', props: { headline: marker('ABOUT') } },
]
const topLevelBlocks: BlockConfig[] = [
  { id: 'top-hero', type: 'hero', variant: 'gradient', props: { headline: marker('TOPLEVEL') } },
]

const multiPageConfig: SiteConfig = {
  name: 'Multi',
  pages: [
    { id: 'p1', name: 'Home', path: '/', blocks: homeBlocks },
    { id: 'p2', name: 'About', path: '/about', blocks: aboutBlocks },
  ],
  blocks: topLevelBlocks,
}

describe('SC-001 — page isolation', () => {
  it('returns one document per page, in page order, keyed by normalized path', () => {
    const docs = exportSitePages(multiPageConfig)
    expect(docs.map((doc) => doc.path)).toEqual(['/', '/about'])
    expect(docs).toHaveLength(2)
  })

  it('renders each document from its own page blocks only', () => {
    const docs = exportSitePages(multiPageConfig)
    expect(docs[0].html).toContain(marker('HOME'))
    expect(docs[0].html).not.toContain(marker('ABOUT'))
    expect(docs[1].html).toContain(marker('ABOUT'))
    expect(docs[1].html).not.toContain(marker('HOME'))
  })

  it('never lets top-level blocks reach any document when pages is non-empty', () => {
    for (const doc of exportSitePages(multiPageConfig)) {
      expect(doc.html).not.toContain(marker('TOPLEVEL'))
    }
  })

  it('the single-document export is exactly the `/` entry', () => {
    expect(exportSiteToHTML(multiPageConfig)).toBe(exportSitePages(multiPageConfig)[0].html)
  })

  it('normalizes raw page paths on the way out, and honours page-1-is-`/`', () => {
    const raw = exportSitePages({
      name: 'Raw',
      pages: [
        { id: 'a', name: 'Home', path: '/Home Page.html', blocks: homeBlocks },
        { id: 'b', name: 'About', path: '/About Us.html', blocks: aboutBlocks },
      ],
      blocks: topLevelBlocks,
    })
    expect(raw.map((doc) => doc.path)).toEqual(['/', '/about-us'])
    // Path and block order stay paired: page 2's markup sits in the `/about-us`
    // document, not page 1's — a normalizer that reorders paths would pass the
    // previous assertion but break this one.
    expect(raw[1].html).toContain(marker('ABOUT'))
  })

  it('promotes page 1 to `/` and renders ITS blocks when no page is authored at `/`', () => {
    const pageXBlocks: BlockConfig[] = [
    { id: 'x-hero', type: 'hero', variant: 'gradient', props: { headline: marker('PAGE_X') } },
  ]
    const docs = exportSitePages({
      name: 'NoHome',
      pages: [
        { id: 'x', name: 'X', path: '/x', blocks: pageXBlocks },
        { id: 'y', name: 'Y', path: '/y', blocks: homeBlocks },
      ],
      blocks: topLevelBlocks,
    })
    expect(docs.map((doc) => doc.path)).toEqual(['/', '/y'])
    // Page 1's AUTHORED path is discarded by the normalizer, but its blocks are
    // not: the promoted page is still page 1, and the `/` document is what
    // `exportSiteToHTML` returns.
    expect(docs[0].html).toContain(marker('PAGE_X'))
    expect(docs[0].html).not.toContain(marker('HOME'))
    expect(docs[0].html).toBe(exportSiteToHTML({
      name: 'NoHome',
      pages: [
        { id: 'x', name: 'X', path: '/x', blocks: pageXBlocks },
        { id: 'y', name: 'Y', path: '/y', blocks: homeBlocks },
      ],
      blocks: topLevelBlocks,
    }))
  })

  it('falls back to one `/` document from top-level blocks when pages is absent or empty', () => {
    for (const config of [
      { name: 'NoPages', blocks: homeBlocks },
      { name: 'EmptyPages', pages: [], blocks: homeBlocks },
    ] as SiteConfig[]) {
      const docs = exportSitePages(config)
      expect(docs).toHaveLength(1)
      expect(docs[0].path).toBe('/')
      expect(docs[0].html).toBe(exportSiteToHTML(config))
      expect(docs[0].html).toContain(marker('HOME'))
    }
  })

  it('passes render options through to every document', () => {
    const settings = { siteName: 'Acme', gaId: 'G-OPTS', language: 'English' }
    for (const doc of exportSitePages(multiPageConfig, { settings })) {
      expect(doc.html).toContain('G-OPTS')
    }
  })

  // Review finding: the FAQ accordion SCRIPT is gated on `hasFaq`, which is one of
  // the two reads of `blocks` inside the document body. It survives every other
  // assertion in this suite if it is reverted to reading `config.blocks`:
  // reversing the mutation left the full 1151-test suite green, because no
  // legacy corpus entry has page-1 blocks differing from top-level blocks. So
  // this test deliberately points the faq at page 2 only AND leaves a top-level
  // faq that must NOT leak — both directions, so either read site fails it.
  it('gates the FAQ accordion script on each page\'s OWN blocks, not top-level', () => {
    const faqBlocks: BlockConfig[] = [
      { id: 'q', type: 'faq', variant: 'accordion', props: { title: 'FAQ', items: [{ question: 'Q', answer: 'A' }] } },
    ]
    const docs = exportSitePages({
      name: 'FaqPlacement',
      pages: [
        { id: 'p1', name: 'Home', path: '/', blocks: homeBlocks },
        { id: 'p2', name: 'Faq', path: '/faq', blocks: faqBlocks },
      ],
      blocks: faqBlocks, // stale top-level mirror — must be ignored entirely
    })
    expect(docs[1].html).toContain('function toggleFaq(btn)')
    expect(docs[0].html).not.toContain('function toggleFaq(btn)')
  })

    // vk-tester (category 1) found the one surviving mutation: writing normalized
  // paths back onto `config.pages` in place. `page-path.ts` already promises the
  // input array is never mutated, but nothing carried that promise through the
  // public entry point — and a consuming worker holds a config it may re-persist.
  it('never mutates the caller\'s config', () => {
    const config: SiteConfig = {
      name: 'Purity',
      pages: [
        { id: 'p1', name: 'Home', path: '/Home Page.html', blocks: homeBlocks },
        { id: 'p2', name: 'About', path: '/About Us.html', blocks: aboutBlocks },
      ],
      blocks: topLevelBlocks,
    }
    const before = JSON.stringify(config)
    const docs = exportSitePages(config)
    expect(docs.map((doc) => doc.path)).toEqual(['/', '/about-us'])
    expect(JSON.stringify(config)).toBe(before)
  })

  // Same promise for the render options. `renderDocument` reads
  // `options.settings` once per page, so one write there corrupts every later
  // page's `<title>` AND the caller's own object — the config-purity mutation's
  // twin, and the one a consuming worker would actually be holding.
  it('never mutates the caller\'s render settings', () => {
    const settings = { siteName: 'Acme', seoTitle: 'Acme' }
    const before = JSON.stringify(settings)
    const docs = exportSitePages(multiPageConfig, { settings })
    for (const doc of docs) expect(doc.html).toContain('<title>Acme</title>')
    expect(JSON.stringify(settings)).toBe(before)
  })

  it('tolerates a page with no blocks instead of throwing', () => {
    const docs = exportSitePages({
      name: 'NoPageBlocks',
      pages: [
        { id: 'p1', name: 'Home', path: '/', blocks: homeBlocks },
        { id: 'p2', name: 'Broken', path: '/broken' },
      ],
      blocks: homeBlocks,
    } as unknown as SiteConfig)
    expect(docs).toHaveLength(2)
    expect(docs[1].path).toBe('/broken')
    expect(docs[1].html).toContain('<!DOCTYPE html>')
    expect(docs[1].html).not.toContain(marker('HOME'))
  })
})

// Red Team #10 — sanitization is only proven for the single-page path by the
// existing suite. Pages 2 and 3 carry the payloads, so an implementation that
// rendered pages through a different (un-escaping) branch would pass every
// isolation test above and still ship stored XSS on sub-pages.
describe('FR-001 — per-page XSS payloads (Red Team #10)', () => {
  const payloadBlocks: BlockConfig[] = [
    {
      id: 'xss-text',
      type: 'hero',
      variant: 'centered',
      props: { headline: '</script><script>alert(1)</script>' },
    },
    {
      id: 'xss-link',
      type: 'cta',
      variant: 'simple',
      props: { buttonText: 'Click', buttonUrl: 'javascript:alert(1)' },
    },
    {
      id: 'xss-obfuscated',
      type: 'cta',
      variant: 'simple',
      props: { buttonText: 'Obfuscated', buttonUrl: 'jav&#x09;ascript:alert(1)' },
    },
  ]

  const xssConfig: SiteConfig = {
    name: 'XSS',
    pages: [
      { id: 'p0', name: 'Home', path: '/', blocks: homeBlocks },
      { id: 'p1', name: 'A', path: '/a', blocks: payloadBlocks },
      { id: 'p2', name: 'B', path: '/b', blocks: payloadBlocks },
    ],
    blocks: topLevelBlocks,
  }

  it('sanitizes page-2 and page-3 payloads exactly as the single-document path does', () => {
    const docs = exportSitePages(xssConfig)
    for (const i of [1, 2]) {
      const asHome = exportSiteToHTML({
        ...xssConfig,
        pages: [{ ...xssConfig.pages![i], path: '/' }],
      })
      expect(docs[i].html, `page ${i} differs from the single-document render`).toBe(asHome)
    }
  })

  it('emits no live script tag or javascript: URL on any page', () => {
    for (const doc of exportSitePages(xssConfig)) {
      expect(doc.html).not.toContain('<script>alert(1)</script>')
      expect(doc.html).not.toContain('javascript:alert(1)')
      expect(doc.html.toLowerCase()).not.toContain('javascript:')
    }
  })
})

describe('SC-002 / NF-001 — legacy corpus byte-identity', () => {
  // Read + parse the corpus ONCE: `corpus()` re-reads and re-parses every JSON
  // file on each call, and it was being called from three `it.each` maps.
  const entries = corpus()

  it('the corpus is non-trivial (guard against an empty fixture set)', () => {
    expect(entries.length).toBeGreaterThanOrEqual(6)
    for (const entry of entries) expect(snapshot(entry.slug).length).toBeGreaterThan(0)
  })

  it.each(entries.map((entry) => [entry.slug, entry] as const))(
    'single-document export of %s is byte-identical to the frozen 0.2.0 snapshot',
    (_slug, entry) => {
      expect(exportSiteToHTML(entry.config, entry.options ?? undefined)).toBe(snapshot(entry.slug))
    },
  )

  it.each(entries.map((entry) => [entry.slug, entry] as const))(
    'multi-page export of %s yields exactly one `/` entry equal to that snapshot',
    (_slug, entry) => {
      const docs = exportSitePages(entry.config, entry.options ?? undefined)
      expect(docs).toHaveLength(1)
      expect(docs[0].path).toBe('/')
      expect(docs[0].html).toBe(snapshot(entry.slug))
    },
  )
})
// FR-C2 — `exportSiteToHTML` must not throw on any config `main`
// accepted. `homeBlocks` read `pages[0].blocks` unguarded and `renderDocument`
// immediately calls `blocks.some(...)`, so `pages:[{path:'/',blocks:undefined}]`
// and `pages:[{blocks:null}]` both threw. On `main` those configs exported fine
// (it read `config.blocks`), so this is a backwards-compatibility break on a
// shipped, consumer-facing public export.
//
// D3: tolerant, not loud. Both entry points return `[]` blocks rather than
// throwing. (An earlier note claimed `exportSitePages` already did this; it only guarded
// page `blocks`, not `pages` itself — that was fixed and the
// both-entry-points table at the bottom of this file now proves it.)
// DATA-LOSS FRAMING: a blank home page is silently published, which is
// why README states the outcome explicitly.
describe('SC-001 — FR-C2 exportSiteToHTML never throws on configs main accepted', () => {
  const MALFORMED: Array<[string, unknown]> = [
    ['blocks undefined', [{ path: '/', blocks: undefined }]],
    ['blocks null', [{ blocks: null }]],
    ['blocks missing entirely', [{ path: '/' }]],
    ['page itself null', [null]],
    ['page itself undefined', [undefined]],
    ['page itself a number', [42]],
    ['pages a string', 'ab'],
    ['pages a number', 42],
    ['pages null', null],
    ['pages an object', { '0': { path: '/' } }],
    ['pages empty array', []],
    ['pages array of empty objects', [{}]],
    // Review finding: `?? []` covers null/undefined but passes a STRING, NUMBER or
    // OBJECT straight through, so these threw the identical TypeError the phase
    // was raised to remove. Guarding at `renderDocument` (the one function both
    // entry points pass blocks through) is what makes the fix class-complete
    // rather than a longer list of the same two cases.
    ['page blocks a string', [{ path: '/', blocks: 'x' }]],
    ['page blocks a number', [{ path: '/', blocks: 42 }]],
    ['page blocks an object', [{ path: '/', blocks: {} }]],
    ['page blocks a boolean', [{ path: '/', blocks: true }]],
    ['top-level blocks a string', [{ path: '/', blocks: [] }]],
  ]

  it.each(MALFORMED)('pages %s renders an empty-body document, no throw', (_label, pages) => {
    const config = {
      name: 'Malformed',
      blocks: [{ id: 'top', type: 'hero', variant: 'centered', props: { headline: marker('TOP') } }],
      pages,
    } as unknown as SiteConfig

    let html: string
    expect(() => {
      html = exportSiteToHTML(config)
    }, `exportSiteToHTML threw for pages=${_label}`).not.toThrow()

    expect(html!).toContain('<!DOCTYPE html>')
    // The malformed page list must not leak the top-level blocks either: page 1
    // is authoritative whenever `pages` is a NON-EMPTY array, so a blank page 1
    // publishes blank. `pages: 'ab'` / `42` / `{}` / `null` are not arrays, so
    // those fall back to `config.blocks` — both directions are asserted below
    // rather than conflated.
    if (Array.isArray(pages) && pages.length > 0) {
      expect(html!, `pages=${_label}: empty page 1 must not fall back to top-level blocks`).not.toContain(marker('TOP'))
    }
  })

  it('falls back to top-level blocks when pages is NOT a non-empty array', () => {
    for (const pages of ['ab', 42, null, undefined, {}]) {
      const html = exportSiteToHTML({
        name: 'Fallback',
        blocks: [{ id: 'top', type: 'hero', variant: 'centered', props: { headline: marker('TOP') } }],
        pages,
      } as unknown as SiteConfig)
      expect(html, `pages=${JSON.stringify(pages)}`).toContain(marker('TOP'))
    }
  })

  it.each([
    ['a string', 'x'],
    ['a number', 42],
    ['an object', {}],
    ['a boolean', true],
  ])('exportSitePages tolerates page blocks that are %s (same class, both entry points)', (_label, blocks) => {
    // The half of the class `homeBlocks` alone cannot cover: a malformed block
    // list on page 2+ reaches `exportSitePages`' own call to `renderDocument`.
    // Guarding only `homeBlocks` left THIS path throwing.
    const config = {
      name: 'BadBlocks',
      pages: [
        { path: '/', blocks: homeBlocks },
        { path: '/about', blocks },
      ],
      blocks: topLevelBlocks,
    } as unknown as SiteConfig

    let docs: Array<{ path: string; html: string }>
    expect(() => {
      docs = exportSitePages(config)
    }, `exportSitePages threw for page blocks ${_label}`).not.toThrow()
    expect(docs!).toHaveLength(2)
    expect(docs![0].html).toContain(marker('HOME'))
    expect(docs![1].html, 'a malformed body costs that page its body only').toContain('<!DOCTYPE html>')
  })

  it('a malformed page 2 does not affect the home document', () => {
    const config = {
      name: 'BadPage2',
      pages: [
        { path: '/', blocks: homeBlocks },
        { path: '/about', blocks: undefined },
      ],
      blocks: topLevelBlocks,
    } as unknown as SiteConfig
    const html = exportSiteToHTML(config)
    expect(html).toContain(marker('HOME'))
    expect(html).not.toContain(marker('TOPLEVEL'))
  })

  it('exportSitePages agrees with exportSiteToHTML on a blank page 1 (no asymmetry)', () => {
    const config = {
      name: 'Blank',
      pages: [{ path: '/', blocks: undefined }, { path: '/about', blocks: aboutBlocks }],
      blocks: topLevelBlocks,
    } as unknown as SiteConfig
    const docs = exportSitePages(config)
    expect(docs).toHaveLength(2)
    expect(docs[0].path).toBe('/')
    expect(docs[0].html).toBe(exportSiteToHTML(config))
    expect(docs[0].html).not.toContain(marker('TOPLEVEL'))
  })
})


// The MALFORMED table above only ever called `exportSiteToHTML`,
// so every green run was blind to `exportSitePages` throwing on a non-array or
// null-bearing `pages` (it read `pages.map(page => page.path)` unguarded). A publisher
// calls `exportSitePages` once per publish, so one bad page must not abort it.
//
// Each hostile input below would coerce to a PLAUSIBLE wrong answer if the guard
// were `!pages || !pages.length` (the shipped one): `{length:2}` and 'ab' have a
// truthy non-zero `length`, so a length-only check walks straight into `.map`.
describe('SC-001 — exportSitePages and exportSiteToHTML are both total and agree', () => {
  const okPage = { path: '/', blocks: [{ id: 'h', type: 'hero', variant: 'centered', props: { headline: marker('OK') } }] }
  const CASES: Array<[string, unknown]> = [
    ['pages a string', 'abc'],
    ['pages a number', 5],
    ['pages {length:2}', { length: 2 }],
    ['pages null', null],
    ['pages [null]', [null]],
    ['pages [ok, null]', [okPage, null]],
    ['pages [null, ok]', [null, okPage]],
    ['page path a number', [{ path: 7, blocks: okPage.blocks }]],
    ['page path an object', [{ path: {}, blocks: okPage.blocks }, { path: '/b' }]],
    ['page blocks a string', [{ path: '/', blocks: 'x' }]],
    ['page blocks null', [{ path: '/', blocks: null }]],
    // Sparse arrays: `Array.isArray` is true and `.map` SKIPS holes, so a map-based
    // implementation returns a sparse result whose `docs[0]` is `undefined`.
    ['pages sparse, hole at 0', (() => { const a: unknown[] = []; a[1] = okPage; return a })()],
    ['pages new Array(2)', new Array(2)],
  ]

  it.each(CASES)('%s: neither entry point throws, and page 1 agrees', (_label, pages) => {
    const config = {
      name: 'Hostile',
      blocks: [{ id: 'top', type: 'hero', variant: 'centered', props: { headline: marker('TOP') } }],
      pages,
    } as unknown as SiteConfig

    let docs: Array<{ path: string; html: string }> = []
    expect(() => {
      docs = exportSitePages(config)
    }, `exportSitePages threw for ${_label}`).not.toThrow()
    let single = ''
    expect(() => {
      single = exportSiteToHTML(config)
    }, `exportSiteToHTML threw for ${_label}`).not.toThrow()

    expect(docs.length).toBeGreaterThanOrEqual(1)
    // Every slot is a real document (a sparse result would fail here).
    for (const doc of docs) expect(typeof doc?.html).toBe('string')
    expect(docs[0].path).toBe('/')
    expect(docs[0].html).toBe(single)
  })

  it('a non-array `pages` renders the top-level blocks at `/` through BOTH entry points', () => {
    for (const pages of ['abc', 5, { length: 2 }, null]) {
      const config = {
        name: 'Fallback',
        blocks: [{ id: 'top', type: 'hero', variant: 'centered', props: { headline: marker('TOP') } }],
        pages,
      } as unknown as SiteConfig
      const docs = exportSitePages(config)
      expect(docs, `pages=${JSON.stringify(pages)}`).toHaveLength(1)
      expect(docs[0].html).toContain(marker('TOP'))
    }
  })

  it('[ok, null] keeps the good page body and gives the null page an empty one', () => {
    const docs = exportSitePages({ name: 'Mixed', blocks: [], pages: [okPage, null] } as unknown as SiteConfig)
    expect(docs).toHaveLength(2)
    expect(docs[0].html).toContain(marker('OK'))
    expect(docs[1].html).not.toContain(marker('OK'))
    // The null slot gets the normalizer's path, not `undefined`/duplicate `/`.
    expect(docs[1].path).toMatch(/^\/./)
    expect(docs[1].path).not.toBe(docs[0].path)
  })
})
