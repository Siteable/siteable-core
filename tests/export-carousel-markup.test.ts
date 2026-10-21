/**
 * The exported carousel markup.
 *
 * This suite is about the markup CONTRACT, not the runtime: one labelled
 * region, one slide per item in item order, the first slide shown and the rest
 * hidden, a previous and a next control with accessible names, ending at the
 * list start, ids that are content-free and unique per document, and class
 * lists that keep the `hidden` attribute in charge. The interactions
 * themselves are proven against this markup by the behavior-table suites.
 *
 * Every assertion reads the exported document rather than a hand-built
 * fragment, so a divergence between the renderer and the runtime cannot pass.
 */
import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import { renderGallery } from '../src/lib/export-blocks/render-gallery'
import { BEHAVIOR_RUNTIME_SOURCE } from '../src/lib/export-behavior-runtime'
import {
  findSite,
  fixtureHtml,
  render,
} from './helpers/export-baseline-0.4.0-inputs'
import { noScriptText } from './helpers/tab-set-allowed-diff'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const ID_CHARSET_RE = /^[A-Za-z0-9_-]+$/
const CAROUSEL_ID_RE = /^sb_carousel_\d+title$/

/**
 * The stylesheet rules exactly as the exporter emits them. Duplicated literals
 * on purpose: asserting against the constant that produced the bytes would move
 * with the implementation and prove nothing about the page.
 */
const CAROUSEL_RULES_LITERAL =
  '[data-sb-carousel-prev],[data-sb-carousel-next]{display:none!important}\n[data-sb-carousel-slide]{display:block!important}'
const TAB_RULES_LITERAL =
  '[data-sb-tablist]{display:none!important}\n[data-sb-tab-panel],[data-sb-tab-title]{display:block!important}'

const SLIDE_DISPLAY_TRAP = ['block', 'flex', 'grid', 'inline', 'inline-block', 'hidden']

const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html')

function site(blocks: BlockConfig[], config?: Partial<SiteConfig>): SiteConfig {
  return { name: 'Site', blocks, ...config } as SiteConfig
}

function renderPage(...blocks: BlockConfig[]): string {
  return exportSiteToHTML(site(blocks))
}

function testimonialsBlock(props: Record<string, unknown>, id = 't-1'): BlockConfig {
  return { id, type: 'testimonials', variant: 'cards', props }
}

function galleryBlock(props: Record<string, unknown>, id = 'g-1'): BlockConfig {
  return { id, type: 'gallery', variant: 'grid', props }
}

function testimonial(name: string, role: string, quote: string, rating?: number) {
  return { name, role, quote, ...(rating === undefined ? {} : { rating }) }
}

function image(alt: string, caption: string) {
  return { src: '', alt, caption }
}

const TESTIMONIAL_ITEMS = [
  testimonial('First Person', 'Role One', 'First quote', 5),
  testimonial('Second Person', 'Role Two', 'Second quote'),
  testimonial('Third Person', 'Role Three', 'Third quote'),
]

const GALLERY_IMAGES = [
  image('Image 1', 'First caption'),
  image('Image 2', 'Second caption'),
  image('Image 3', 'Third caption'),
  image('Image 4', 'Fourth caption'),
]

/** A testimonials block whose props make it a carousel, with three items. */
function carouselTestimonials(overrides: Record<string, unknown> = {}): BlockConfig {
  return testimonialsBlock({
    title: 'Customer stories',
    display: 'carousel',
    items: TESTIMONIAL_ITEMS,
    ...overrides,
  })
}

/** A gallery block whose props make it a carousel, with four images. */
function carouselGallery(overrides: Record<string, unknown> = {}): BlockConfig {
  return galleryBlock({
    title: 'Image gallery',
    display: 'carousel',
    images: GALLERY_IMAGES,
    ...overrides,
  })
}

function regions(doc: Document): Element[] {
  return [...doc.querySelectorAll('[role="region"][aria-roledescription="carousel"]')]
}

function slidesOf(region: Element): Element[] {
  return [...region.querySelectorAll('[data-sb-carousel-slide]')]
}

function headingOf(doc: Document, region: Element): Element | null {
  const id = region.getAttribute('aria-labelledby')
  return id ? doc.getElementById(id) : null
}

/** Assert the shared region/slide/control contract for one rendered carousel. */
function expectCarouselContract(
  doc: Document,
  region: Element,
  labels: string[],
  count: number,
): void {
  expect(region.hasAttribute('data-sb-carousel'), 'region hook missing').toBe(true)

  const slides = slidesOf(region)
  expect(slides, 'one slide per item').toHaveLength(count)

  slides.forEach((slide, index) => {
    expect(slide.getAttribute('role'), `slide ${index + 1} role`).toBe('group')
    expect(slide.getAttribute('aria-roledescription'), `slide ${index + 1}`).toBe('slide')
    expect(slide.getAttribute('aria-label'), `slide ${index + 1} position`).toBe(
      `${index + 1} of ${count}`,
    )
    expect((slide as HTMLElement).hidden, `slide ${index + 1} hidden state`).toBe(index > 0)
    expect(slide.textContent, `slide ${index + 1} content`).toContain(labels[index])
  })

  // Item order: the exposed sequence follows the authored list.
  const text = region.textContent ?? ''
  for (let i = 1; i < labels.length; i += 1) {
    expect(text.indexOf(labels[i - 1]), `order at ${i}`).toBeLessThan(text.indexOf(labels[i]))
  }

  const prev = region.querySelector('[data-sb-carousel-prev]')
  const next = region.querySelector('[data-sb-carousel-next]')
  expect(prev, 'previous control missing').not.toBeNull()
  expect(next, 'next control missing').not.toBeNull()
  expect(prev!.tagName).toBe('BUTTON')
  expect(next!.tagName).toBe('BUTTON')
  expect(prev!.getAttribute('aria-label')).toBe('Previous slide')
  expect(next!.getAttribute('aria-label')).toBe('Next slide')
  expect((prev as HTMLButtonElement).disabled, 'previous disabled at the start').toBe(true)
  expect((next as HTMLButtonElement).disabled, 'next enabled at the start').toBe(false)
}

describe('one labelled region with one slide per item', () => {
  it.each(['cards', 'scroller', 'spotlight', 'bogus-variant'])(
    'testimonials variant %s renders the same carousel contract',
    (variant) => {
      const block = carouselTestimonials()
      block.variant = variant
      const doc = parse(renderPage(block))

      const found = regions(doc)
      expect(found, 'exactly one carousel region').toHaveLength(1)

      const region = found[0]
      expect(region.getAttribute('aria-labelledby')).toBe('sb_carousel_1title')
      const heading = headingOf(doc, region)
      expect(heading?.tagName, 'the region is named by its heading').toBe('H2')
      expect(heading?.textContent).toBe('Customer stories')

      expectCarouselContract(
        doc,
        region,
        TESTIMONIAL_ITEMS.map((item) => item.quote),
        3,
      )
    },
  )

  it.each(['grid', 'masonry', 'bogus-variant'])(
    'gallery variant %s renders the same carousel contract',
    (variant) => {
      const block = carouselGallery()
      block.variant = variant
      const doc = parse(renderPage(block))

      const found = regions(doc)
      expect(found, 'exactly one carousel region').toHaveLength(1)

      const region = found[0]
      expect(region.getAttribute('aria-labelledby')).toBe('sb_carousel_1title')
      const heading = headingOf(doc, region)
      expect(heading?.tagName).toBe('H2')
      expect(heading?.textContent).toBe('Image gallery')

      expectCarouselContract(
        doc,
        region,
        GALLERY_IMAGES.map((item) => item.caption),
        4,
      )
    },
  )

  it('a gallery carousel without a title is named by aria-label instead', () => {
    const doc = parse(renderPage(carouselGallery({ title: undefined })))
    const found = regions(doc)
    expect(found).toHaveLength(1)
    expect(found[0].getAttribute('aria-labelledby')).toBeNull()
    expect(found[0].getAttribute('aria-label')).toBe('Carousel')
  })

  it('a title present in the markup always names the region through its heading', () => {
    const doc = parse(renderPage(carouselGallery({ title: 'Named' })))
    const region = regions(doc)[0]
    expect(region.getAttribute('aria-labelledby')).toBe('sb_carousel_1title')
    expect(region.getAttribute('aria-label')).toBeNull()
  })

  it('the opted-in gallery replaces the default grid markup instead of adding to it', () => {
    const block = carouselGallery({ title: 'Gallery' })
    const carouselPage = renderPage(block)

    // The default layout's grid wrapper is gone; the only frame is the slide.
    expect(carouselPage).toContain('data-sb-carousel')
    expect(carouselPage).not.toContain('grid grid-cols-2 md:grid-cols-3 gap-3')
  })
})

describe('ids are content-free, unique per document and per page', () => {
  it('two carousels on one page are numbered separately', () => {
    const doc = parse(
      renderPage(carouselTestimonials(), carouselGallery({ title: 'Second' })),
    )
    const found = regions(doc)
    expect(found).toHaveLength(2)
    expect(found.map((region) => region.getAttribute('aria-labelledby'))).toEqual([
      'sb_carousel_1title',
      'sb_carousel_2title',
    ])
    expect(doc.getElementById('sb_carousel_1title')?.textContent).toBe('Customer stories')
    expect(doc.getElementById('sb_carousel_2title')?.textContent).toBe('Second')
  })

  it('every generated id uses only letters, digits, hyphens and underscores', () => {
    const html = renderPage(carouselTestimonials(), carouselGallery({ title: 'Second' }))
    const ids = [...html.matchAll(/\sid="(sb_carousel_[^"]+)"/g)].map((match) => match[1])
    expect(ids, 'no generated ids found').toHaveLength(2)
    for (const id of ids) {
      expect(id, id).toMatch(ID_CHARSET_RE)
      expect(id, id).toMatch(CAROUSEL_ID_RE)
    }
  })

  it('two blocks sharing one block id still get distinct region ids, and the anchor lands once', () => {
    const doc = parse(
      renderPage(carouselTestimonials(), carouselTestimonials({ title: 'Twin' })),
    )
    const found = regions(doc)
    expect(found).toHaveLength(2)
    expect(found.map((region) => region.getAttribute('aria-labelledby'))).toEqual([
      'sb_carousel_1title',
      'sb_carousel_2title',
    ])
    // The anchor id is only emitted on the first block that claims it.
    expect(doc.querySelectorAll('section[id="t-1"]')).toHaveLength(1)
  })

  it('the per-document counter restarts on every page of a multi-page site', () => {
    // Page 1 carries TWO carousels and page 2 carries ONE, so a counter shared
    // across pages would give page 2 `sb_carousel_3title`.
    const pages = exportSitePages({
      name: 'Site',
      blocks: [],
      pages: [
        {
          id: 'a',
          name: 'A',
          path: '/',
          blocks: [carouselTestimonials(), carouselGallery({ title: 'Second' })],
        },
        { id: 'b', name: 'B', path: '/b', blocks: [carouselTestimonials()] },
      ],
    } as SiteConfig)

    expect(pages).toHaveLength(2)
    expect(pages[0].html).toContain('id="sb_carousel_1title"')
    expect(pages[0].html).toContain('id="sb_carousel_2title"')
    expect(pages[1].html).toContain('id="sb_carousel_1title"')
    expect(pages[1].html).not.toContain('sb_carousel_2')
  })

  it('the region id never derives from content', () => {
    const html = renderPage(carouselTestimonials({ title: 'A title with spaces!' }))
    // A content-derived id would carry the title's words; the constant prefix does not.
    expect(html).not.toContain('sb_carousel_A')
    expect(html.match(/id="sb_carousel_\d+title"/g) ?? []).toHaveLength(1)
  })
})

describe('class lists keep the hidden attribute in charge', () => {
  it('no slide carries a display utility or a transition', () => {
    const doc = parse(renderPage(carouselTestimonials()))
    const slides = slidesOf(regions(doc)[0])
    expect(slides, 'no slides rendered').toHaveLength(3)

    for (const slide of slides) {
      const classes = slide.getAttribute('class') ?? ''
      const tokens = classes.split(/\s+/)
      for (const banned of SLIDE_DISPLAY_TRAP) {
        expect(tokens, `slide class: ${classes}`).not.toContain(banned)
      }
      expect(classes).not.toContain('transition')
      expect(classes).not.toContain('animate')
    }
  })

  it('the container that holds the slides carries no display utility either', () => {
    const doc = parse(renderPage(carouselGallery()))
    const container = slidesOf(regions(doc)[0])[0].parentElement
    expect(container, 'no slide container').not.toBeNull()

    const classes = container!.getAttribute('class') ?? ''
    const tokens = classes.split(/\s+/)
    for (const banned of SLIDE_DISPLAY_TRAP) {
      expect(tokens, `container class: ${classes}`).not.toContain(banned)
    }
    expect(classes).not.toContain('transition')
    expect(classes).not.toContain('animate')
  })

  it('both controls carry the minimum tap target size', () => {
    const doc = parse(renderPage(carouselTestimonials()))
    const region = regions(doc)[0]
    for (const control of [
      region.querySelector('[data-sb-carousel-prev]')!,
      region.querySelector('[data-sb-carousel-next]')!,
    ]) {
      const classes = control.getAttribute('class') ?? ''
      expect(classes, classes).toContain('min-h-[40px]')
      expect(classes, classes).toContain('min-w-[40px]')
    }
  })
})

describe('hostile props never throw and never leak a value', () => {
  it('null and primitive testimonial entries render one slide each', () => {
    const html = renderPage(
      testimonialsBlock({ title: 'Odd', display: 'carousel', items: [null, 7, []] }),
    )
    const doc = parse(html)
    const region = regions(doc)[0]
    expect(region, 'no carousel region rendered').toBeTruthy()
    expect(slidesOf(region)).toHaveLength(3)
    const text = region.textContent ?? ''
    expect(text).not.toContain('undefined')
    expect(text).not.toContain('[object Object]')
  })

  it('non-string alt, caption and name values are coerced to empty text', () => {
    const html = renderPage(
      galleryBlock({
        title: 'Odd',
        display: 'carousel',
        images: [
          { src: 'https://example.com/a.png', alt: 7, caption: {} },
          { src: '', alt: null, caption: ['x'] },
        ],
      }),
    )
    const region = parse(html).querySelector('[data-sb-carousel]') as HTMLElement
    expect(region).toBeTruthy()

    const picture = region.querySelector('img')
    expect(picture, 'an allowed image source still renders').not.toBeNull()
    // The non-string alt contributed nothing to the attribute, and neither
    // non-string caption contributed a text run: both slides are text-empty.
    expect(picture!.getAttribute('alt')).toBe('')
    for (const slide of slidesOf(region)) {
      expect(slide.textContent?.trim(), `slide text: ${slide.textContent}`).toBe('')
    }
  })

  it('null and primitive gallery entries render one slide each', () => {
    // Deliberate: one slide per RAW entry (no object filter), so the slide count
    // always equals the list the predicate counted.
    const html = renderPage(
      galleryBlock({ title: 'Odd', display: 'carousel', images: [null, 7, []] }),
    )
    const region = parse(html).querySelector('[data-sb-carousel]') as HTMLElement
    expect(region, 'no carousel region rendered').toBeTruthy()
    expect(slidesOf(region)).toHaveLength(3)
    for (const slide of slidesOf(region)) {
      expect(slide.textContent?.trim(), `slide text: ${slide.textContent}`).toBe('')
    }
  })

  it('a testimonial entry with a non-string quote renders an empty quote', () => {
    const html = renderPage(
      testimonialsBlock({
        title: 'Odd',
        display: 'carousel',
        items: [
          { name: 'A', role: 'R', quote: { text: 'x' } },
          { name: 'B', role: 'R', quote: 12 },
        ],
      }),
    )
    const region = regions(parse(html))[0]
    expect(slidesOf(region)).toHaveLength(2)
    expect(region.textContent ?? '').not.toContain('[object Object]')
  })
})

describe('a block without the option keeps the default renderer', () => {
  it('testimonials without display is byte-identical to the frozen default page', () => {
    expect(render(findSite('testimonials-no-display'))).toBe(
      fixtureHtml('testimonials-no-display.html'),
    )
  })

  it('gallery without display is byte-identical to the frozen default page', () => {
    expect(render(findSite('gallery-no-display'))).toBe(fixtureHtml('gallery-no-display.html'))
  })

  it('the default gallery renderer bytes appear verbatim when the option is absent', () => {
    // An id outside the anchor shape is not injected, so the page carries the
    // default renderer's output byte-for-byte and can be compared directly.
    const block: BlockConfig = {
      id: 'G-1',
      type: 'gallery',
      variant: 'grid',
      props: { title: 'Gallery', images: GALLERY_IMAGES },
    }
    expect(renderPage(block)).toContain(renderGallery(block))
  })

  it.each([
    ['no option', {}],
    ['a wrong-case value', { display: 'CAROUSEL' }],
    ['a padded value', { display: ' carousel' }],
    ['a number', { display: 1 }],
    ['an array', { display: ['carousel'] }],
  ])('testimonials with %s renders no carousel', (_label, extra) => {
    const html = renderPage(testimonialsBlock({ title: 'X', items: TESTIMONIAL_ITEMS, ...extra }))
    expect(html).not.toContain('data-sb-carousel')
    expect(html).not.toContain('data-sb-runtime')
  })

  it('a one-item block asking for a carousel renders the default layout', () => {
    const html = renderPage(
      testimonialsBlock({ title: 'Only', display: 'carousel', items: [TESTIMONIAL_ITEMS[0]] }),
    )
    expect(html).not.toContain('data-sb-carousel')
    expect(html).toContain('lg:grid-cols-3')
  })

  it('a one-image gallery asking for a carousel renders the default layout', () => {
    const html = renderPage(
      galleryBlock({ title: 'Only', display: 'carousel', images: [GALLERY_IMAGES[0]] }),
    )
    expect(html).not.toContain('data-sb-carousel')
    expect(html).toContain('<div id="g-1"')
  })

  it.each(['testimonials', 'gallery'] as const)(
    'a %s block asking for a carousel with no explicit list renders the default layout',
    (type) => {
      // The predicate reads the RAW prop list, never the renderer's fallback
      // defaults, so the markup and the emission decision cannot disagree. The
      // fallback entries therefore render in the default layout, not as slides.
      const html = renderPage({ id: 'x-1', type, variant: '', props: { title: 'No list', display: 'carousel' } } as BlockConfig)
      expect(html).not.toContain('data-sb-carousel')
      expect(html).not.toContain('data-sb-runtime')
    },
  )
})

describe('one script per page, and only when a carousel renders', () => {
  it('a carousel page carries exactly one runtime script with the current source', () => {
    const html = renderPage(carouselTestimonials())
    expect(html.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)

    const scripts = parse(html).querySelectorAll('script[data-sb-runtime]')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].textContent).toBe(BEHAVIOR_RUNTIME_SOURCE)
    expect((scripts[0] as HTMLScriptElement).src).toBe('')
  })

  it('a gallery carousel page carries the same single script', () => {
    expect(renderPage(carouselGallery()).match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
  })

  it('the script stays inside the cumulative and hard gzip ceilings', () => {
    // Measured on the script element extracted from the exported page.
    const scriptText =
      parse(renderPage(carouselTestimonials())).querySelector('script[data-sb-runtime]')
        ?.textContent ?? ''
    expect(scriptText, 'no runtime script in the page').not.toBe('')

    const size = gzipSync(Buffer.from(scriptText, 'utf8')).length
    expect(size, 'cumulative ceiling').toBeLessThanOrEqual(3348)
    expect(size, 'hard cap').toBeLessThanOrEqual(5120)
  })

  it('a carousel-only page emits exactly the carousel rules', () => {
    expect(noScriptText(renderPage(carouselTestimonials()))).toBe(CAROUSEL_RULES_LITERAL)
  })

  it('a page without a carousel emits no carousel rules', () => {
    const navbar: BlockConfig = {
      id: 'nav-1',
      type: 'navbar',
      variant: 'default',
      props: { logo: 'Acme', links: ['Product'], ctaText: 'Start' },
    }
    const text = noScriptText(renderPage(navbar))
    expect(text).toContain('[data-sb-menu-toggle]')
    expect(text).not.toContain('[data-sb-carousel-slide]')
  })

  it('a page with a tab set and a carousel keeps the tab rules before the carousel rules', () => {
    const tabs: BlockConfig = {
      id: 'f-1',
      type: 'features',
      variant: 'grid',
      props: {
        title: 'Features',
        display: 'tabs',
        items: [
          { title: 'One', description: 'First' },
          { title: 'Two', description: 'Second' },
        ],
      },
    }
    const text = noScriptText(renderPage(tabs, carouselTestimonials()))

    expect(text.indexOf(TAB_RULES_LITERAL), 'tab rules missing').toBeGreaterThan(-1)
    expect(text.indexOf(CAROUSEL_RULES_LITERAL), 'carousel rules missing').toBeGreaterThan(-1)
    expect(text.indexOf(TAB_RULES_LITERAL)).toBeLessThan(text.indexOf(CAROUSEL_RULES_LITERAL))
  })

  it('two carousels on one page still share one script element', () => {
    const html = renderPage(carouselTestimonials(), carouselGallery({ title: 'Second' }))
    expect(html.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
  })
})
