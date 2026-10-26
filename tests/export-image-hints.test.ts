/**
 * Image loading hints on exported documents: every `<img>` decodes async, the
 * first emitted hero image is high priority and never lazy, the navbar logo is
 * not lazy, everything else is lazy.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { imgHintAttrs } from '../src/lib/export-img-hints'
import type { SiteConfig } from '../src/blocks/types'

const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html')

function site(blocks: unknown[]): SiteConfig {
  return { name: 'T', blocks } as unknown as SiteConfig
}

const attrs = (img: Element): Record<string, string | null> => ({
  decoding: img.getAttribute('decoding'),
  loading: img.getAttribute('loading'),
  fetchpriority: img.getAttribute('fetchpriority'),
})

const LOGO = { decoding: 'async', loading: null, fetchpriority: null }
const PRIORITY = { decoding: 'async', loading: null, fetchpriority: 'high' }
const LAZY = { decoding: 'async', loading: 'lazy', fetchpriority: null }

const imgs = (html: string): Element[] => [...parse(html).querySelectorAll('body img')]
const bySrc = (html: string, src: string): Element => {
  const found = imgs(html).find((i) => i.getAttribute('src') === src)
  if (!found) throw new Error(`no img ${src}`)
  return found
}

describe('imgHintAttrs', () => {
  it('returns the fixed attribute sets', () => {
    expect(imgHintAttrs('logo')).toBe(' decoding="async"')
    expect(imgHintAttrs('priority')).toBe(' decoding="async" fetchpriority="high"')
    expect(imgHintAttrs('lazy')).toBe(' decoding="async" loading="lazy"')
  })
})

describe('exported image loading hints', () => {
  const blocks = [
    { type: 'navbar', props: { logo: 'Brand', logoImage: 'https://cdn.example.com/logo.png' } },
    { type: 'hero', variant: 'split', props: { headline: 'A', heroImage: 'https://cdn.example.com/h1.png' } },
    { type: 'hero', variant: 'split', props: { headline: 'B', heroImage: 'https://cdn.example.com/h2.png' } },
    { type: 'image', props: { src: 'https://cdn.example.com/i.png', alt: 'i' } },
    { type: 'footer', props: { logo: 'F', logoImage: 'https://cdn.example.com/f.png' } },
  ]

  it('assigns exact attribute sets per image', () => {
    const html = exportSiteToHTML(site(blocks))
    expect(attrs(bySrc(html, 'https://cdn.example.com/logo.png'))).toEqual(LOGO)
    expect(attrs(bySrc(html, 'https://cdn.example.com/h1.png'))).toEqual(PRIORITY)
    expect(attrs(bySrc(html, 'https://cdn.example.com/h2.png'))).toEqual(LAZY)
    expect(attrs(bySrc(html, 'https://cdn.example.com/i.png'))).toEqual(LAZY)
    expect(attrs(bySrc(html, 'https://cdn.example.com/f.png'))).toEqual(LAZY)
  })

  it('gives priority to the first hero that really emits an image', () => {
    const html = exportSiteToHTML(
      site([
        { type: 'hero', variant: 'split', props: { headline: 'A', heroImage: 'javascript:alert(1)' } },
        { type: 'hero', variant: 'split', props: { headline: 'B', heroImage: 'https://cdn.example.com/h2.png' } },
      ]),
    )
    expect(imgs(html)).toHaveLength(1)
    expect(attrs(bySrc(html, 'https://cdn.example.com/h2.png'))).toEqual(PRIORITY)
  })

  it('emits exactly one loading attribute on card grid images', () => {
    const html = exportSiteToHTML(
      site([{ type: 'card-grid', props: { items: [{ image: 'https://cdn.example.com/c.png', name: 'C' }] } }]),
    )
    const raw = html.match(/<img[^>]*c\.png[^>]*>/)?.[0] ?? ''
    expect(raw.match(/loading=/g)).toHaveLength(1)
    expect(attrs(bySrc(html, 'https://cdn.example.com/c.png'))).toEqual(LAZY)
  })

  it('hints every img of a mixed page with decoding async', () => {
    const html = exportSiteToHTML(
      site([
        ...blocks,
        { type: 'gallery', props: { images: [{ src: 'https://cdn.example.com/g.png', alt: 'g' }] } },
        { type: 'testimonials', props: { items: [{ name: 'N', quote: 'q', avatar: 'https://cdn.example.com/a.png' }] } },
        { type: 'team', props: { members: [{ name: 'M', avatar: 'https://cdn.example.com/m.png' }] } },
      ]),
    )
    expect(imgs(html).length).toBeGreaterThan(6)
    for (const img of imgs(html)) expect(img.getAttribute('decoding')).toBe('async')
  })
})
