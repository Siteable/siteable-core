import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { SiteConfig } from '../src/blocks/types'

// SC-005 / NF-002: every BlockType must render real markup on export.
// One block per type, in the canonical order from src/blocks/types.ts.
const coverageConfig: SiteConfig = {
  name: 'Coverage',
  blocks: [
    { id: 'b-navbar', type: 'navbar', variant: 'default', props: { links: ['A'] } },
    { id: 'b-hero', type: 'hero', variant: 'centered', props: { headline: 'Hi' } },
    {
      id: 'b-features',
      type: 'features',
      variant: 'grid',
      props: { items: [{ title: 'Fast', description: 'Very fast' }] },
    },
    { id: 'b-pricing', type: 'pricing', variant: 'tiers', props: {} },
    { id: 'b-cta', type: 'cta', variant: 'simple', props: {} },
    { id: 'b-footer', type: 'footer', variant: 'default', props: { links: ['A'] } },
    {
      id: 'b-testimonials',
      type: 'testimonials',
      variant: 'grid',
      props: { items: [{ quote: 'Great', name: 'Ada' }] },
    },
    {
      id: 'b-stats',
      type: 'stats',
      variant: 'row',
      props: { items: [{ label: 'Users', value: '100' }] },
    },
    {
      id: 'b-faq',
      type: 'faq',
      variant: 'list',
      props: { items: [{ question: 'Q?', answer: 'A.' }] },
    },
    {
      id: 'b-team',
      type: 'team',
      variant: 'grid',
      props: { items: [{ name: 'Ada', role: 'Engineer' }] },
    },
    { id: 'b-contact', type: 'contact', variant: 'form', props: {} },
    { id: 'b-newsletter', type: 'newsletter', variant: 'inline', props: {} },
    { id: 'b-logocloud', type: 'logocloud', variant: 'grid', props: { logos: ['A'] } },
    {
      id: 'b-content',
      type: 'content',
      variant: 'prose',
      props: { body: '## Heading\n\nSome **bold** text.' },
    },
    { id: 'b-image', type: 'image', variant: 'hero-image', props: {} },
    {
      id: 'b-video',
      type: 'video',
      variant: 'youtube',
      props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    },
    { id: 'b-gallery', type: 'gallery', variant: 'grid', props: {} },
    { id: 'b-divider', type: 'divider', variant: 'line', props: { height: 60, width: 'full' } },
    {
      id: 'b-banner',
      type: 'banner',
      variant: 'ribbon',
      props: { text: 'Hello World', linkText: 'More', linkUrl: '#' },
    },
  ],
}

const html = exportSiteToHTML(coverageConfig)

/** Minimal single-video config; `variant` selects the id extractor. */
function videoConfig(variant: string, url: string): SiteConfig {
  return {
    name: 'Video',
    blocks: [{ id: 'b-video', type: 'video', variant, props: { url } }],
  }
}

describe('export video block embeds (SC-009 / SC-010)', () => {
  it('SC-009: builds the YouTube iframe src from the extracted id, not the raw url', () => {
    const out = exportSiteToHTML(
      videoConfig('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    )

    expect(out).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
  })

  it('SC-009: builds the Vimeo iframe src from the extracted id, not the raw url', () => {
    const out = exportSiteToHTML(
      videoConfig('vimeo', 'https://vimeo.com/123456789')
    )

    expect(out).toContain('src="https://player.vimeo.com/video/123456789"')
  })

  it('SC-010: a YouTube variant url yielding no id emits no iframe', () => {
    const out = exportSiteToHTML(
      videoConfig('youtube', 'https://example.com/not-a-video')
    )

    expect(out).not.toContain('<iframe')
  })

  it('SC-010: a Vimeo variant url yielding no id emits no iframe', () => {
    const out = exportSiteToHTML(videoConfig('vimeo', 'https://example.com/x'))

    expect(out).not.toContain('<iframe')
  })
})

describe('export block coverage (SC-005 / NF-002)', () => {
  it('renders every block type with no unknown-block fallback', () => {
    expect(html).not.toContain('Unknown block type')
  })

  it('renders content block markdown to escaped markup', () => {
    expect(html).toContain('<strong')
  })

  it('renders image block with aspect or placeholder class', () => {
    expect(html.includes('aspect') || html.includes('from-bg-3')).toBe(true)
  })

  it('renders video block with an iframe', () => {
    expect(html).toContain('<iframe')
  })

  it('renders gallery block with the placeholder class', () => {
    expect(html).toContain('from-bg-3')
  })

  it('renders divider block with height styling', () => {
    expect(html.includes('min-height') || html.includes('height:')).toBe(true)
  })

  it('renders banner block text', () => {
    expect(html).toContain('Hello World')
  })
})
