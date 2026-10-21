/**
 * Carousel pages against the frozen export.
 *
 * The frozen fixtures in `tests/fixtures/export-baseline-0.4.0/` were captured
 * on the released 0.4.0 commit and are digest-pinned by the frozen-baseline
 * suite, which also owns the strict comparisons for every page that carries no
 * carousel. This suite owns the pages that DO render a carousel, and it compares
 * them under the permitted-difference rule: mask the carousel regions, strip the
 * carousel rules, and on a carousel-only page strip the script and no-script
 * elements 0.4.0 never emitted — everything else must match byte for byte.
 *
 * The strip counts below are the tripwire that keeps the rule NARROW: a change
 * anywhere else on the page turns this suite red.
 */
import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  exportSitePages,
  findSite,
  fixtureHtml,
  render,
} from './helpers/export-baseline-0.4.0-inputs'
import {
  maskCarouselSections,
  reduceCarouselForComparison,
} from './helpers/carousel-allowed-diff'
import { noScriptText } from './helpers/tab-set-allowed-diff'
import { BEHAVIOR_RUNTIME_SOURCE } from '../src/lib/export-behavior-runtime'
import type { BaselineSite } from './helpers/export-baseline-0.4.0-inputs'

const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html')

const CAROUSEL_RULES_LITERAL =
  '[data-sb-carousel-prev],[data-sb-carousel-next]{display:none!important}\n[data-sb-carousel-slide]{display:block!important}'

function regions(html: string): Element[] {
  return [...parse(html).querySelectorAll('[role="region"][aria-roledescription="carousel"]')]
}

function slidesOf(region: Element): Element[] {
  return [...region.querySelectorAll('[data-sb-carousel-slide]')]
}

/**
 * Reduce a FRESH carousel-only page to the bytes it must keep, asserting the
 * strip counts that prove the rule is narrow. The frozen side is reduced
 * identically — its block anchor is masked too — but only the fresh side's
 * counts are asserted: it is the side that must show the expected population.
 */
function normalizeCarouselOnly(fresh: string, blockIds: string[]): string {
  const reduced = reduceCarouselForComparison(fresh, blockIds, 'carousel-only')
  expect(reduced.counts.scripts, 'carousel-only page carries no script element').toBe(1)
  expect(reduced.counts.noscripts, 'carousel-only page carries no no-script element').toBe(1)
  expect(reduced.counts.carouselRules, 'carousel rules were not found').toBe(1)
  expect(reduced.counts.sections, 'the named carousel region was not masked').toBe(
    blockIds.length,
  )
  return reduced.html
}

function reduceCarouselOnly(html: string, blockIds: string[]): string {
  return reduceCarouselForComparison(html, blockIds, 'carousel-only').html
}

/** A combo page keeps its frozen menu/faq rules; only the carousel rules leave it. */
function normalizeCombo(fresh: string, blockIds: string[]): string {
  const reduced = reduceCarouselForComparison(fresh, blockIds, 'combo')
  expect(reduced.counts.scripts, 'combo page script text was not emptied').toBe(1)
  expect(reduced.counts.carouselRules, 'carousel rules were not found').toBe(1)
  expect(reduced.counts.sections, 'the named carousel region was not masked').toBe(
    blockIds.length,
  )
  return reduced.html
}

function reduceCombo(html: string, blockIds: string[]): string {
  return reduceCarouselForComparison(html, blockIds, 'combo').html
}

describe('carousel-testimonials', () => {
  const FRESH = render(findSite('carousel-testimonials'))
  const GOLDEN = fixtureHtml('carousel-testimonials.html')

  it('renders one labelled region with three slides, only the first shown', () => {
    const found = regions(FRESH)
    expect(found).toHaveLength(1)

    const slides = slidesOf(found[0])
    expect(slides).toHaveLength(3)
    expect((slides[0] as HTMLElement).hidden).toBe(false)
    expect((slides[1] as HTMLElement).hidden).toBe(true)
    expect((slides[2] as HTMLElement).hidden).toBe(true)
    expect(slides.map((slide) => slide.getAttribute('aria-label'))).toEqual([
      '1 of 3',
      '2 of 3',
      '3 of 3',
    ])
  })

  it('carries exactly one script element with the current runtime source', () => {
    expect(FRESH.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
    const script = parse(FRESH).querySelector('script[data-sb-runtime]')
    expect(script?.textContent).toBe(BEHAVIOR_RUNTIME_SOURCE)
  })

  it('the emitted script is inside the cumulative and hard gzip ceilings', () => {
    // Measured on the script element extracted from the EXPORTED page, not on
    // the constant: the ceiling is a property of the emitted document.
    const scriptText = parse(FRESH).querySelector('script[data-sb-runtime]')?.textContent ?? ''
    expect(scriptText, 'no runtime script in the page').not.toBe('')

    const size = gzipSync(Buffer.from(scriptText, 'utf8')).length
    expect(size, 'cumulative ceiling').toBeLessThanOrEqual(3348)
    expect(size, 'per-atom budget').toBeLessThanOrEqual(2532)
    expect(size, 'hard cap').toBeLessThanOrEqual(5120)
  })

  it('the page matches the golden once the permitted differences are removed', () => {
    expect(normalizeCarouselOnly(FRESH, ['t-1'])).toBe(reduceCarouselOnly(GOLDEN, ['t-1']))
  })
})

describe('carousel-gallery', () => {
  const FRESH = render(findSite('carousel-gallery'))
  const GOLDEN = fixtureHtml('carousel-gallery.html')

  it('renders one labelled region with four slides, only the first shown', () => {
    const found = regions(FRESH)
    expect(found).toHaveLength(1)

    const slides = slidesOf(found[0])
    expect(slides).toHaveLength(4)
    expect((slides[0] as HTMLElement).hidden).toBe(false)
    for (const slide of slides.slice(1)) expect((slide as HTMLElement).hidden).toBe(true)
  })

  it('each slide holds its own caption and the placeholder for an empty source', () => {
    const slides = slidesOf(regions(FRESH)[0])
    const captions = ['First caption', 'Second caption', 'Third caption', 'Fourth caption']

    slides.forEach((slide, index) => {
      expect(slide.textContent, `slide ${index + 1} caption`).toContain(captions[index])
      for (const other of captions) {
        if (other !== captions[index]) {
          expect(slide.textContent, `slide ${index + 1} carries another caption`).not.toContain(
            other,
          )
        }
      }
      // The fixture sources are empty strings, so the gradient placeholder is
      // the rendered frame and no live image is emitted.
      expect(slide.querySelector('img'), `slide ${index + 1} image`).toBeNull()
      expect(slide.querySelector('svg'), `slide ${index + 1} placeholder`).not.toBeNull()
    })
  })

  it('the page matches the golden once the permitted differences are removed', () => {
    expect(normalizeCarouselOnly(FRESH, ['g-1'])).toBe(reduceCarouselOnly(GOLDEN, ['g-1']))
  })
})

describe('carousel-variants, one carousel for every variant', () => {
  const IDS = ['t-cards', 't-scroller', 't-spotlight', 'g-grid', 'g-masonry']

  it('renders five independent regions with numbered ids', () => {
    const found = regions(render(findSite('carousel-variants')))
    expect(found).toHaveLength(5)
    expect(found.map((region) => region.getAttribute('aria-labelledby'))).toEqual([
      'sb_carousel_1title',
      'sb_carousel_2title',
      'sb_carousel_3title',
      'sb_carousel_4title',
      'sb_carousel_5title',
    ])
  })

  it('the page matches the golden with all five regions masked', () => {
    expect(normalizeCarouselOnly(render(findSite('carousel-variants')), IDS)).toBe(
      reduceCarouselOnly(fixtureHtml('carousel-variants.html'), IDS),
    )
  })
})

describe('navbar-faq-carousel, a combo page', () => {
  const html = render(findSite('navbar-faq-carousel'))

  it('keeps the frozen menu and faq rules and appends the carousel rules after them', () => {
    const rules = noScriptText(html)
    expect(rules).toContain('[data-sb-menu-toggle]')
    expect(rules).toContain('.faq-content')
    expect(rules.indexOf(CAROUSEL_RULES_LITERAL)).toBeGreaterThan(
      rules.indexOf('[data-sb-menu-toggle]'),
    )
  })

  it('the page matches the golden with the region masked, the rules removed and the script text emptied', () => {
    expect(normalizeCombo(html, ['t-1'])).toBe(
      reduceCombo(fixtureHtml('navbar-faq-carousel.html'), ['t-1']),
    )
  })
})

describe('two-page site, only page 1 carries the script', () => {
  const entry: BaselineSite = findSite('two-page-carousel')
  const pages = exportSitePages(entry.config, entry.options ?? undefined)

  it('exports two pages', () => {
    expect(pages).toHaveLength(2)
  })

  it('page 1 renders the carousel and its masked form matches the golden', () => {
    expect(normalizeCarouselOnly(pages[0].html, ['t-1'])).toBe(
      reduceCarouselOnly(fixtureHtml('two-page-carousel--1.html'), ['t-1']),
    )
  })

  it('page 2 has no carousel and no script, and is strictly identical to its golden', () => {
    expect(pages[1].html).toBe(fixtureHtml('two-page-carousel--2.html'))
    expect(pages[1].html).not.toContain('data-sb-runtime')
  })
})

describe('the non-opted-in pages carry no carousel', () => {
  // Strict byte identity to the script-free goldens is owned by the frozen
  // baseline suite; this is the explicit re-assertion, so a suite move cannot
  // leave the claim unasserted here.
  it.each([
    'testimonials-no-display',
    'gallery-no-display',
    'carousels-one-item',
    'carousels-hostile-display',
  ])('%s carries no runtime script and no carousel hook', (slug) => {
    const html = render(findSite(slug))
    expect(html).not.toContain('data-sb-runtime')
    expect(html).not.toContain('data-sb-carousel')
  })

  it('page 2 of the two-page site carries no carousel hook', () => {
    const entry: BaselineSite = findSite('two-page-carousel')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)
    expect(pages[1].html).not.toContain('data-sb-carousel')
  })
})

describe('helper teeth — the permitted-difference rule stays narrow', () => {
  it('a byte outside the masked regions is a failure', () => {
    const entry = findSite('carousel-testimonials')
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })

    expect(normalizeCarouselOnly(mutated, ['t-1'])).not.toBe(
      reduceCarouselOnly(fixtureHtml('carousel-testimonials.html'), ['t-1']),
    )
  })

  it('the frozen gallery root is a div, and the second mask form bites on it', () => {
    // The carousel path roots at a section, so the frozen default-layout gallery
    // block must still be maskable or the comparison would be vacuous.
    const masked = maskCarouselSections(fixtureHtml('carousel-gallery.html'), ['g-1'])
    expect(masked.counts.sections, 'frozen gallery block was not masked').toBe(1)
    expect(masked.html).toContain('<!--block:g-1-->')
    expect(masked.html).not.toContain('<div id="g-1"')
  })

  it('a mask count mismatch is a failure, not a silently shorter document', () => {
    const html = render(findSite('carousel-testimonials'))
    const masked = maskCarouselSections(html, ['t-missing'])

    // Nothing was masked, so the region markup must survive whole. The only
    // change this call may make is the rule strip, asserted separately — the
    // equality below isolates the mask count instead of comparing against a raw
    // render that still carries the rules.
    expect(masked.counts.sections).toBe(0)
    expect(masked.counts.carouselRules).toBe(1)
    expect(masked.html).toBe(html.replace(CAROUSEL_RULES_LITERAL, ''))
    expect(masked.html).toContain('<section id="t-1"')
    expect(masked.html).toContain('</body>')
  })

  it('a page that stopped rendering its carousel fails the wrapper strip count', () => {
    expect(() =>
      normalizeCarouselOnly(fixtureHtml('carousel-testimonials.html'), ['t-1']),
    ).toThrow()
  })

  it('masking a region cannot swallow the document when it is never closed', () => {
    const doc = '  <section id="t-1" role="region">\n<p>tail</p>\n'
    const masked = maskCarouselSections(doc, ['t-1'])

    expect(masked.counts.sections).toBe(0)
    expect(masked.html).toBe(doc)
  })
})
