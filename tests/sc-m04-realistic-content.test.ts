/**
 * SC-M04 (mechanical half) — the six previously-unrendered block types publish
 * as real sections when given realistic, hand-authored content.
 *
 * SC-M04 is declared `[HUMAN-ONLY]` and asks a reviewer to confirm each block
 * "renders as a plausible, visually coherent section rather than a raw prop
 * dump". Only the aesthetic half of that needs a person. The "rather than a raw
 * prop dump" half is a set of mechanical properties that a broken renderer fails
 * immediately — a React object leaking through as `[object Object]`, an
 * unresolved `undefined`, an unhandled `NaN`, or the dispatcher's
 * `<!-- Unknown block type -->` fallback. Those are pinned here.
 *
 * The published path is exercised (`exportSiteToHTML`), not the bare renderers,
 * because SC-M04 is about what a *published site* shows. Existing coverage sits
 * elsewhere: `export-blocks-golden` pins exact markup per variant, and
 * `export-block-coverage` asserts dispatch. This file asserts the properties a
 * human would otherwise have to eyeball.
 *
 * What remains genuinely human after this file: whether the result *looks* good.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

// Realistic hand-authored content, not one-word placeholders — a renderer that
// silently drops a prop is far more visible against prose than against "x".
const BLOCKS: BlockConfig[] = [
  {
    id: 'nav',
    type: 'navbar',
    variant: 'default',
    props: {
      logo: 'Northwind',
      links: [
        { label: 'Features', href: '#features' },
        { label: 'Pricing', href: '/pricing' },
      ],
      ctaText: 'Start free',
      ctaUrl: 'https://example.com/signup',
    },
  },
  {
    id: 'content',
    type: 'content',
    variant: 'prose',
    props: {
      body: [
        '## Why teams switch',
        '',
        'Most tools make you choose between **speed** and *control*.',
        '',
        '- Ship in an afternoon',
        '- Keep every pixel yours',
      ].join('\n'),
    },
  },
  {
    id: 'image',
    type: 'image',
    variant: 'hero-image',
    props: {
      src: 'https://cdn.example.com/hero.png',
      alt: 'Dashboard overview',
      title: 'Everything in one place',
      subtitle: 'Built for small teams',
    },
  },
  {
    id: 'video',
    type: 'video',
    variant: 'youtube',
    props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Product tour' },
  },
  {
    id: 'gallery',
    type: 'gallery',
    variant: 'grid',
    props: {
      title: 'Selected work',
      images: [
        { src: 'https://cdn.example.com/one.png', alt: 'First project', caption: 'Acme' },
        { src: 'https://cdn.example.com/two.png', alt: 'Second project', caption: 'Globex' },
      ],
    },
  },
  { id: 'divider', type: 'divider', variant: 'line', props: { height: 60, width: 'full' } },
  {
    id: 'banner',
    type: 'banner',
    variant: 'bar',
    props: { text: 'Now in public beta', linkText: 'Read the announcement', linkUrl: 'https://example.com/blog' },
  },
  {
    id: 'footer',
    type: 'footer',
    variant: 'simple',
    props: { logo: 'Northwind', copyright: '© 2026 Northwind Ltd', links: ['Privacy', 'Terms'] },
  },
]

const CONFIG: SiteConfig = { name: 'Northwind', blocks: BLOCKS }

const html = exportSiteToHTML(CONFIG)

/** Strings a broken renderer leaks when it stringifies something it should have rendered. */
const RAW_DUMP_MARKERS = [
  '[object Object]',
  'undefined',
  'NaN',
  '<!-- Unknown block type',
]

describe('SC-M04 — no raw prop dump reaches the published page', () => {
  it('leaks none of the stringified-value markers', () => {
    const found = RAW_DUMP_MARKERS.filter((m) => html.includes(m))
    expect(found).toEqual([])
  })

  it('dispatches every block type (no Unknown-block fallback, no empty output)', () => {
    expect(html).not.toContain('Unknown block type')
    expect(html.length).toBeGreaterThan(2000)
  })

  it('emits no empty attribute values for the blocks under test', () => {
    // `src=""` / `href=""` would mean a prop was read but lost on the way out.
    expect(html).not.toContain('src=""')
    expect(html).not.toContain('href=""')
  })
})

describe('SC-M04 — each of the six blocks publishes its content', () => {
  it('content: renders the markdown body as real prose, not escaped source', () => {
    // `##`/`**`/`*`/`-` are markdown, so none should survive as literal syntax.
    expect(html).toContain('Why teams switch')
    expect(html).toContain('Ship in an afternoon')
    expect(html).not.toContain('## Why teams switch')
    expect(html).not.toContain('**speed**')
    // Assert the bolded WORD is wrapped, not merely that some <strong> exists —
    // the tag carries a class, so a bare-tag match would be both brittle and weaker.
    expect(html).toMatch(/<strong[^>]*>speed<\/strong>/)
  })

  it('image: renders the hero image with its alt text', () => {
    expect(html).toContain('https://cdn.example.com/hero.png')
    expect(html).toContain('Dashboard overview')
    expect(html).toContain('Everything in one place')
  })

  it('video: renders an iframe built only from the extracted id, plus the title', () => {
    expect(html).toContain('<iframe')
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(html).toContain('Product tour')
  })

  it('gallery: renders every image with its caption', () => {
    expect(html).toContain('Selected work')
    expect(html).toContain('https://cdn.example.com/one.png')
    expect(html).toContain('https://cdn.example.com/two.png')
    expect(html).toContain('Acme')
    expect(html).toContain('Globex')
  })

  it('divider: renders a section for a block that carries no text', () => {
    // A divider has no text of its own, so this is the case where a silently
    // dropped renderer is hardest to notice by eye.
    const withDivider = exportSiteToHTML(CONFIG)
    const withoutDivider = exportSiteToHTML({
      ...CONFIG,
      blocks: CONFIG.blocks.filter((b) => b.type !== 'divider'),
    })
    expect(withDivider.length).toBeGreaterThan(withoutDivider.length)
  })

  it('banner: renders its text and a real anchor for the CTA', () => {
    expect(html).toContain('Now in public beta')
    expect(html).toContain('Read the announcement')
    expect(html).toContain('href="https://example.com/blog"')
  })

  it('renders all six types in one page without any of them displacing another', () => {
    expect(html).toContain('Why teams switch') // content
    expect(html).toContain('https://cdn.example.com/hero.png') // image
    expect(html).toContain('<iframe') // video
    expect(html).toContain('Selected work') // gallery
    expect(html).toContain('Now in public beta') // banner
    // divider asserted above by the length delta
    expect(html).toContain('Start free') // navbar + footer chrome intact
  })
})
