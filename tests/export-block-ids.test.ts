/**
 * Block-root `id` attribute tests — FR-005.
 *
 * Covers: SC-020, SC-021, SC-023.
 *
 * Each rendered block's EXISTING root element must carry `id="{block.id}"` when
 * `block.id` matches `^[a-z][a-z0-9-]{0,63}$`; otherwise the attribute is absent.
 * No wrapper element is introduced, and when two blocks on one page declare the
 * same valid id, only the FIRST in document order receives it.
 *
 * Hero/centered renders a single `<section class="…">` root, so these tests use
 * hero blocks and assert against `<section id="…"`.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { SiteConfig, BlockConfig, BlockType } from '../src/blocks/types'

const hero = (id: string, headline: string): BlockConfig => ({
  id,
  type: 'hero',
  variant: 'centered',
  props: { headline },
})

describe('FR-005 — block root id attributes', () => {
  it('SC-020 — a valid block id is emitted on the block root exactly once', () => {
    // SC-020 has two clauses: the target block's root carries the id, AND a link
    // to that anchor is emitted so `#pricing` actually resolves. The navbar link
    // renders through the policy-gated `renderLink` — a `#fragment` passes
    // `isAllowedUrl`, so it must publish as a real `<a href="#pricing">`, not a
    // `<span>`.
    const config: SiteConfig = {
      name: 'x',
      blocks: [
        {
          id: 'nav',
          type: 'navbar',
          variant: 'default',
          props: {
            logo: 'Acme',
            links: [{ label: 'Pricing', href: '#pricing' }],
            ctaText: 'Go',
          },
        },
        { id: 'pricing', type: 'hero', variant: 'centered', props: { headline: 'Pricing' } },
      ],
    }
    const html = exportSiteToHTML(config)
    // Clause 1: the target block root carries the id...
    expect(html).toContain('<section id="pricing"')
    // ...and it appears exactly once (a single resolvable anchor).
    expect((html.match(/id="pricing"/g) || []).length).toBe(1)
    // Clause 2: the navbar link to `#pricing` is emitted as a resolvable anchor.
    expect(html).toContain('href="#pricing"')
  })

  it('SC-021 — invalid ids are dropped, the valid id is kept', () => {
    const config: SiteConfig = {
      name: 'x',
      blocks: [hero('A_B', 'Upper'), hero('1abc', 'Digit'), hero('block-123', 'Valid')],
    }
    const html = exportSiteToHTML(config)
    expect(html).not.toContain('id="A_B"')
    expect(html).not.toContain('id="1abc"')
    expect(html).toContain('<section id="block-123"')
    expect((html.match(/<section id="/g) || []).length).toBe(1)
  })

  it('SC-023 — duplicate id: the first declaring block wins', () => {
    const config: SiteConfig = {
      name: 'x',
      blocks: [hero('dup', 'FIRST_BLOCK'), hero('dup', 'SECOND_BLOCK')],
    }
    const html = exportSiteToHTML(config)
    expect((html.match(/id="dup"/g) || []).length).toBe(1)
    const idPos = html.indexOf('id="dup"')
    expect(idPos).toBeGreaterThanOrEqual(0)
    // The single id lands on the FIRST block, not the second.
    expect(idPos).toBeLessThan(html.indexOf('FIRST_BLOCK'))
    expect(html.indexOf('FIRST_BLOCK')).toBeLessThan(html.indexOf('SECOND_BLOCK'))
  })

  it('introduces no wrapper element — each root carries its own id', () => {
    const config: SiteConfig = {
      name: 'x',
      blocks: [hero('one', 'One'), hero('two', 'Two')],
    }
    const html = exportSiteToHTML(config)
    // Each root element carries its own id...
    expect(html).toContain('<section id="one"')
    expect(html).toContain('<section id="two"')
    // ...and no wrapper-with-id element was introduced around the block.
    expect(html).not.toContain('<div id=')
    // Still exactly two `<section ` roots: the id was attached to the existing
    // root, not achieved by wrapping each block.
    expect((html.match(/<section /g) || []).length).toBe(2)
  })

  it('SC-021 — a missing or non-string id omits the attribute entirely', () => {
    // A block whose id is `undefined` must not emit `id=""`.
    const noId = exportSiteToHTML({
      name: 'x',
      blocks: [
        { id: undefined as unknown as string, type: 'hero', variant: 'centered', props: { headline: 'NoId' } },
      ],
    })
    expect(noId).not.toMatch(/id="/)

    // A block whose id is `null` must not emit `id="null"`.
    const nullId = exportSiteToHTML({
      name: 'x',
      blocks: [
        { id: null as unknown as string, type: 'hero', variant: 'centered', props: { headline: 'NullId' } },
      ],
    })
    expect(nullId).not.toMatch(/id="/)

    // Sanity: a valid sibling in the same config still gets its id.
    const withSibling = exportSiteToHTML({
      name: 'x',
      blocks: [
        { id: undefined as unknown as string, type: 'hero', variant: 'centered', props: { headline: 'NoId' } },
        hero('sibling', 'Sibling'),
      ],
    })
    expect(withSibling).toContain('<section id="sibling"')
  })
})

describe('FR-005 — id injection through exportSiteToHTML for the six new block types', () => {
  it('the dispatcher attaches each new renderer root id via the full export path', () => {
    // The golden tests (tests/export-blocks-golden.test.ts) call the raw
    // renderers directly, bypassing `renderBlock`/`withBlockId`. This exercises
    // the real dispatcher so FR-005 is proven for every new type too. All six
    // renderers root on a `<div>`.
    const config: SiteConfig = {
      name: 'x',
      blocks: [
        { id: 'content-1', type: 'content', variant: 'prose', props: { body: 'Hello **world**' } },
        { id: 'image-1', type: 'image', variant: 'hero-image', props: { src: 'https://cdn.example.com/x.png', alt: 'x' } },
        { id: 'video-1', type: 'video', variant: 'youtube', props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } },
        { id: 'gallery-1', type: 'gallery', variant: 'grid', props: { images: [{ src: 'https://cdn.example.com/a.png', alt: 'a' }] } },
        { id: 'divider-1', type: 'divider', variant: 'line', props: { height: 40 } },
        { id: 'banner-1', type: 'banner', variant: 'ribbon', props: { text: 'Hi' } },
      ],
    }
    const html = exportSiteToHTML(config)
    expect(html).toContain('<div id="content-1"')
    expect(html).toContain('<div id="image-1"')
    expect(html).toContain('<div id="video-1"')
    expect(html).toContain('<div id="gallery-1"')
    expect(html).toContain('<div id="divider-1"')
    expect(html).toContain('<div id="banner-1"')
    // Each id appears exactly once across the document — a single resolvable
    // anchor target per block.
    for (const id of ['content-1', 'image-1', 'video-1', 'gallery-1', 'divider-1', 'banner-1']) {
      expect((html.match(new RegExp(`id="${id}"`, 'g')) || []).length).toBe(1)
    }
  })
})

describe('FR-005 — id length boundary (`^[a-z][a-z0-9-]{0,63}$`)', () => {
  // The regex allows one leading letter plus up to 63 more chars — 64 total.
  // Phase 06 handed this boundary to phase 07: off-by-one in the `{0,63}`
  // quantifier is invisible to SC-021's short invalid ids (`A_B`, `1abc`).
  it('accepts a 64-character id (1 + 63) and rejects a 65-character id', () => {
    const atLimit = 'a' + 'a'.repeat(63) // 64 chars
    const overLimit = 'a' + 'a'.repeat(64) // 65 chars
    expect(atLimit.length).toBe(64)
    expect(overLimit.length).toBe(65)

    const html = exportSiteToHTML({
      name: 'x',
      blocks: [hero(atLimit, 'AT_LIMIT'), hero(overLimit, 'OVER_LIMIT')],
    })

    expect(html).toContain(`<section id="${atLimit}"`)
    expect(html).not.toContain(`id="${overLimit}"`)
    // Exactly one id was emitted — the at-limit block's.
    expect((html.match(/<section id="/g) || []).length).toBe(1)
  })

  it('requires a lowercase leading letter', () => {
    const leading = exportSiteToHTML({
      name: 'x',
      blocks: [hero('Abc', 'A'), hero('-abc', 'B'), hero('9abc', 'C'), hero('abc', 'D')],
    })
    expect(leading).not.toContain('id="Abc"')
    expect(leading).not.toContain('id="-abc"')
    expect(leading).not.toContain('id="9abc"')
    expect(leading).toContain('<section id="abc"')
  })
})

describe('FR-005 — `withBlockId` skips output with no leading root open tag', () => {
  // The `!match` branch: a valid id on markup that does not begin with a
  // `<tagname` (the unknown-block comment is the only reachable case) must be
  // left untouched — the helper never fabricates a wrapper to host the id.
  it('an unknown block type carries no id even when its id is valid', () => {
    const html = exportSiteToHTML({
      name: 'x',
      blocks: [
        // Not a declared BlockType → renderBlockMarkup returns the comment.
        { id: 'valid-id', type: 'mystery' as BlockType, variant: 'default', props: {} },
      ],
    })
    expect(html).toContain('Unknown block type')
    expect(html).not.toContain('id="valid-id"')
  })

  it('a valid sibling block still gets its id alongside an unknown-block comment', () => {
    const html = exportSiteToHTML({
      name: 'x',
      blocks: [
        { id: 'skipped', type: 'mystery' as BlockType, variant: 'default', props: {} },
        hero('kept', 'KEPT'),
      ],
    })
    expect(html).not.toContain('id="skipped"')
    expect(html).toContain('<section id="kept"')
  })
})

describe('FR-005 — export purity (phase-06 success criterion / SC-026 pre-check)', () => {
  it('two exports in one process are byte-identical and dedupe does not leak between calls', () => {
    // A config with a duplicate id proves the per-call `seen` Set is not
    // module-level: if it leaked, the second call would see `dup` as already
    // emitted and drop it.
    const config: SiteConfig = {
      name: 'x',
      blocks: [
        { id: 'dup', type: 'hero', variant: 'centered', props: { headline: 'A' } },
        { id: 'dup', type: 'hero', variant: 'centered', props: { headline: 'B' } },
        { id: 'unique', type: 'hero', variant: 'centered', props: { headline: 'C' } },
      ],
    }
    const first = exportSiteToHTML(config)
    const second = exportSiteToHTML(config)
    expect(second).toBe(first)
    // The duplicate stays deduped on the SECOND call too.
    expect((second.match(/id="dup"/g) || []).length).toBe(1)
  })
})
