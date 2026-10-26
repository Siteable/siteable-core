/**
 * The injection corpus against the carousel export.
 *
 * The shipped corpus file compares each payload's script count against a
 * `props: {}` render, which is the wrong clean side here: a carousel
 * legitimately emits the shared runtime script, so that differential would flag
 * every carousel page as injected. The clean side for this suite is a CAROUSEL
 * page with ordinary copy, so the only difference between the two exports is
 * the payload.
 *
 * The whole-document handler scan and the runtime-source scan mirror the shipped
 * suite and stay exactly as strict: a payload that reaches a tag position is an
 * injection whether or not the block renders a carousel.
 */
import { stripSeo } from './helpers/seo-head-allowed-diff'
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { BEHAVIOR_RUNTIME_SOURCE } from '../src/lib/export-behavior-runtime'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const CORPUS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "' onfocus='x",
  '"><svg/onload=alert(1)>',
  '&amp;',
  '&#106;avascript:alert(1)',
  'javascript:alert(1)',
  // Unicode: an RTL override beside an emoji — the cases that break naive
  // direction or width assumptions rather than only quoting.
  '‮gnitset‬🙂',
  // The corpus length explicitly named.
  'X'.repeat(10_000),
]

/** An `on*=` HANDLER inside a real open tag, not escaped text in a text run. */
const HANDLER_RE = /<[a-zA-Z][^>]*[^\w]on[a-z]+\s*=/i
const countScripts = (html: string): number => (html.match(/<script/gi) ?? []).length
const ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/

const ALLOWED_SRC = 'https://example.com/picture.png'

function page(blocks: BlockConfig[]): string {
  return exportSiteToHTML({ name: 'XSS', blocks } as SiteConfig)
}

function testimonialsPage(field: 'quote' | 'name' | 'role' | 'title', payload: string): string {
  const first = {
    name: 'First Person',
    role: 'Role One',
    quote: 'First quote',
    [field]: payload,
  }
  const second = { name: 'Second Person', role: 'Role Two', quote: 'Second quote' }
  const props: Record<string, unknown> = { display: 'carousel', items: [first, second] }
  if (field === 'title') props.title = payload
  else props.title = 'Customer stories'
  return page([{ id: 't-1', type: 'testimonials', variant: 'cards', props }])
}

function galleryPage(field: 'alt' | 'caption' | 'title', payload: string): string {
  const first = {
    src: ALLOWED_SRC,
    alt: field === 'alt' ? payload : 'Image 1',
    caption: field === 'caption' ? payload : 'First caption',
  }
  const second = { src: '', alt: 'Image 2', caption: 'Second caption' }
  const props: Record<string, unknown> = { display: 'carousel', images: [first, second] }
  props.title = field === 'title' ? payload : 'Image gallery'
  return page([{ id: 'g-1', type: 'gallery', variant: 'grid', props }])
}

/** The same page with benign copy — the differential the script count compares against. */
const CLEAN_TESTIMONIALS = testimonialsPage('quote', 'Clean quote')
const CLEAN_GALLERY = galleryPage('alt', 'Clean alt')

function carouselRegion(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const region = doc.querySelector('[data-sb-carousel]')
  expect(region, 'renderer blanked: no carousel region').not.toBeNull()
  return region as HTMLElement
}

function expectInert(html: string, clean: string, msg: string): void {
  const region = carouselRegion(html)
  expect(countScripts(html), `${msg}: injected script`).toBe(countScripts(clean))

  // Every element in the document, not only inside the region: a payload that
  // escaped its sink would be caught wherever it landed. Read through the DOM
  // rather than a regex over the source — an escaped `onerror=` sitting inside
  // a quoted attribute VALUE is inert text, and a source regex would flag it.
  // The font link's fixed inline onload is a permitted head addition; remove it before scanning.
  const doc = new DOMParser().parseFromString(stripSeo(html), 'text/html')
  for (const element of doc.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      expect(attribute.name, `${msg}: handler attribute on ${element.tagName}`).not.toMatch(/^on/i)
    }
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
  expect(ids.length, `${msg}: no ids found`).toBeGreaterThan(0)
  for (const id of ids) {
    expect(id, `${msg}: id charset`).toMatch(ID_CHARSET_RE)
  }

  expect(region.getAttribute('aria-labelledby') ?? region.getAttribute('aria-label')).toBeTruthy()
}

describe('payloads in testimonial fields stay inert', () => {
  for (const payload of CORPUS) {
    const label = payload.slice(0, 40)

    it.each(['quote', 'name', 'role', 'title'] as const)(
      `testimonial %s ← ${JSON.stringify(label)}`,
      (field) => {
        const html = testimonialsPage(field, payload)
        const msg = `${field} ← ${label}`
        expectInert(html, CLEAN_TESTIMONIALS, msg)

        // The payload survives as literal, inert text.
        expect(carouselRegion(html).textContent, `${msg}: visible text`).toContain(payload)

        if (payload.includes('<')) {
          expect(html, `${msg}: raw payload present`).not.toContain(payload)
        }
      },
    )
  }
})

describe('payloads in gallery fields stay inert', () => {
  for (const payload of CORPUS) {
    const label = payload.slice(0, 40)

    it(`gallery alt ← ${JSON.stringify(label)}`, () => {
      const html = galleryPage('alt', payload)
      const msg = `alt ← ${label}`
      expectInert(html, CLEAN_GALLERY, msg)

      const picture = carouselRegion(html).querySelector('img')
      expect(picture, `${msg}: image not rendered`).not.toBeNull()
      expect(picture!.getAttribute('alt'), `${msg}: alt bytes`).toBe(payload)

      if (payload.includes('<')) {
        expect(html, `${msg}: raw payload present`).not.toContain(payload)
      }
    })

    it(`gallery caption ← ${JSON.stringify(label)}`, () => {
      const html = galleryPage('caption', payload)
      const msg = `caption ← ${label}`
      expectInert(html, CLEAN_GALLERY, msg)
      expect(carouselRegion(html).textContent, `${msg}: visible text`).toContain(payload)

      if (payload.includes('<')) {
        expect(html, `${msg}: raw payload present`).not.toContain(payload)
      }
    })

    it(`gallery title ← ${JSON.stringify(label)}`, () => {
      const html = galleryPage('title', payload)
      const msg = `title ← ${label}`
      expectInert(html, CLEAN_GALLERY, msg)

      const doc = new DOMParser().parseFromString(html, 'text/html')
      expect(doc.querySelector('h2')?.textContent, `${msg}: heading`).toBe(payload)
    })
  }
})

describe('the image source policy still rejects a scheme payload', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x.png'])(
    'an image source of %p renders the placeholder instead',
    (src) => {
      const blocks: BlockConfig[] = [
        {
          id: 'g-1',
          type: 'gallery',
          variant: 'grid',
          props: {
            title: 'Image gallery',
            display: 'carousel',
            images: [
              { src, alt: 'Image 1', caption: 'First caption' },
              { src: ALLOWED_SRC, alt: 'Image 2', caption: 'Second caption' },
            ],
          },
        },
      ]
      const proper = page(blocks)
      expect(proper).not.toContain(`src="${src}"`)
      expect(carouselRegion(proper).querySelector('img')?.getAttribute('src')).toBe(ALLOWED_SRC)
    },
  )
})

describe('the shared runtime source stays injection-free', () => {
  it('carries no HTML-string injection and no dynamic evaluation', () => {
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/\beval\b/)
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/new\s+Function\b/)
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/\binnerHTML\b/)
    expect(BEHAVIOR_RUNTIME_SOURCE).not.toMatch(/\bdocument\.write\b/)
  })

  it('emits no event-handler attribute of its own', () => {
    expect(BEHAVIOR_RUNTIME_SOURCE.match(HANDLER_RE) ?? []).toEqual([])
  })
})
