/**
 * Carousel behavior in the shared runtime.
 *
 * The carousel rides the one exported behavior runtime, so these tests pin the
 * three contracts the exporter and the editor depend on: what counts as a
 * rendered carousel for the emission predicate (so "rendered as a carousel" and
 * "gets the script" cannot drift), the no-script stylesheet composed per block
 * list (the no-argument call still emits the exact bytes the frozen baselines
 * were captured with), and the source executed for real — one slide at a time,
 * no wrap at the ends, the control there disabled, keys scoped to the region,
 * nothing on a timer, and two carousels that never disturb each other.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  BEHAVIOR_RUNTIME_SOURCE,
  CAROUSEL_ID_PREFIX,
  CAROUSEL_NOSCRIPT_CSS,
  carouselRegionId,
  isCarouselBlock,
  needsBehaviorRuntime,
  renderBehaviorNoscript,
} from '../src/lib/export-behavior-runtime'

/** Cumulative gzip ceiling for the whole shared runtime. */
const GZIP_CEILING_BYTES = 3348
/** This widget's own budget on top of the measured menu + faq + tabs baseline. */
const GZIP_BUDGET_BYTES = 1232 + 1300

/** The exact no-script wrapper the released baseline emitted; pinned, not derived. */
const NOSCRIPT_BASELINE =
  '\n  <noscript><style>' +
  '[data-sb-menu-toggle]{display:none!important}\n' +
  '@media (max-width:1023.98px){[data-sb-menu-panel]{display:block!important}}\n' +
  '.faq-content{max-height:none!important;padding-bottom:1rem!important}\n' +
  '.faq-chevron{display:none!important}' +
  '</style></noscript>'

const testimonials = (items: unknown, display: unknown = 'carousel'): unknown => ({
  type: 'testimonials',
  props: { display, items },
})
const gallery = (images: unknown, display: unknown = 'carousel'): unknown => ({
  type: 'gallery',
  props: { display, images },
})
const tabSet = { type: 'features', props: { display: 'tabs', items: [{}, {}] } }

describe('isCarouselBlock — what counts as a rendered carousel', () => {
  it.each([
    ['two testimonials', testimonials([{}, {}]), true],
    ['three testimonials', testimonials([{ name: 'A' }, { name: 'B' }, { name: 'C' }]), true],
    ['two gallery images', gallery([{}, {}]), true],
    ['four gallery images', gallery([{ src: 'a' }, { src: 'b' }, { src: 'c' }, { src: 'd' }]), true],
    ['one testimonial', testimonials([{}]), false],
    ['no testimonials', testimonials([]), false],
    ['one gallery image', gallery([{}]), false],
    ['no gallery images', gallery([]), false],
    ['items is a string', testimonials('carousel'), false],
    ['items is an object', testimonials({ 0: {}, 1: {} }), false],
    ['items missing', { type: 'testimonials', props: { display: 'carousel' } }, false],
    ['props missing', { type: 'testimonials' }, false],
    ['props null', { type: 'testimonials', props: null }, false],
    ['props is an array', { type: 'gallery', props: ['carousel'] }, false],
    ['display flattened beside type', { type: 'gallery', display: 'carousel', images: [{}, {}] }, false],
    [
      'a testimonials block carrying its list on images',
      { type: 'testimonials', props: { display: 'carousel', images: [{}, {}] } },
      false,
    ],
    [
      'a gallery block carrying its list on items',
      { type: 'gallery', props: { display: 'carousel', items: [{}, {}] } },
      false,
    ],
    ['another block type', { type: 'features', props: { display: 'carousel', items: [{}, {}] } }, false],
    ['a non-object', 'gallery', false],
    ['null', null, false],
    ['undefined', undefined, false],
  ])('%s -> %s', (_label, block, expected) => expect(isCarouselBlock(block)).toBe(expected))

  it('requires the exact display string, whatever else it is handed', () => {
    for (const display of ['CAROUSEL', ' carousel', 'carousels', 1, {}, ['carousel'], true]) {
      expect(isCarouselBlock(testimonials([{}, {}], display))).toBe(false)
      expect(isCarouselBlock(gallery([{}, {}], display))).toBe(false)
    }
  })

  it('does not inspect list entries', () => {
    // Entry validity is the renderer's concern: the predicate answers only
    // "does this block render as a carousel", and an entry it never reads
    // cannot make it throw.
    expect(isCarouselBlock(testimonials([{}, 'x']))).toBe(true)
    expect(isCarouselBlock(gallery(['x', {}]))).toBe(true)
  })
})

describe('needsBehaviorRuntime — a carousel joins the predicate', () => {
  const carousel = testimonials([{}, {}])

  it.each([
    ['a navbar alone', [{ type: 'navbar' }], true],
    ['a faq alone', [{ type: 'faq' }], true],
    ['a navbar and a faq', [{ type: 'navbar' }, { type: 'faq' }], true],
    ['neither widget, no carousel', [{ type: 'hero' }, { type: 'footer' }], false],
    ['a navbar plus a carousel', [{ type: 'navbar' }, carousel], true],
    ['a faq plus a carousel', [{ type: 'faq' }, carousel], true],
    ['both plus a carousel', [{ type: 'navbar' }, { type: 'faq' }, carousel], true],
    ['neither widget, plus a carousel', [{ type: 'hero' }, carousel], true],
    ['a one-item carousel', [testimonials([{}])], false],
    ['a carousel beside non-objects', [null, 42, [], carousel], true],
  ])('%s', (_label, blocks, expected) => expect(needsBehaviorRuntime(blocks)).toBe(expected))
})

describe('renderBehaviorNoscript — composed per block list', () => {
  it('emits the baseline menu/faq bytes when called without a block list', () => {
    expect(renderBehaviorNoscript()).toBe(NOSCRIPT_BASELINE)
  })

  it('leaves a navbar-only page byte-identical to the baseline', () => {
    expect(renderBehaviorNoscript([{ type: 'navbar' }])).toBe(NOSCRIPT_BASELINE)
  })

  it('emits only the carousel rules for a carousel-only page', () => {
    const html = renderBehaviorNoscript([testimonials([{}, {}])])
    expect(html).toBe('\n  <noscript><style>' + CAROUSEL_NOSCRIPT_CSS + '</style></noscript>')
    expect(html).not.toContain('[data-sb-menu-toggle]')
    expect(html).not.toContain('[data-sb-tablist]')
  })

  it('puts the menu/faq rules before the carousel rules', () => {
    const html = renderBehaviorNoscript([testimonials([{}, {}]), { type: 'navbar' }])
    // Presence is asserted first: `indexOf` on an absent rule returns -1, which
    // would satisfy the ordering comparison with the earlier rules missing.
    expect(html).toContain('[data-sb-menu-toggle]{display:none!important}')
    expect(html.indexOf('[data-sb-menu-toggle]')).toBeLessThan(
      html.indexOf('[data-sb-carousel-prev]'),
    )
  })

  it('puts the tab rules before the carousel rules', () => {
    const html = renderBehaviorNoscript([tabSet, testimonials([{}, {}])])
    expect(html).toContain('[data-sb-tablist]{display:none!important}')
    expect(html.indexOf('[data-sb-tablist]')).toBeLessThan(html.indexOf('[data-sb-carousel-prev]'))
  })

  it('emits nothing for a page with none of the widgets', () => {
    expect(renderBehaviorNoscript([{ type: 'hero' }])).toBe('')
    expect(renderBehaviorNoscript([])).toBe('')
  })

  it('pins the literal rules that hide both controls and show every slide', () => {
    // Pinned LITERALS, not the constant compared against itself: dropping one of
    // the two control selectors, or weakening the slide rule, must fail here.
    const html = renderBehaviorNoscript([testimonials([{}, {}])])
    expect(html).toContain(
      '[data-sb-carousel-prev],[data-sb-carousel-next]{display:none!important}',
    )
    expect(html).toContain('[data-sb-carousel-slide]{display:block!important}')
  })

  it('marks every carousel declaration important so it beats the hidden state', () => {
    const rules = CAROUSEL_NOSCRIPT_CSS.match(/[^{}]+\{[^{}]*\}/g) ?? []
    expect(rules.length).toBeGreaterThanOrEqual(2)
    for (const rule of rules) {
      for (const declaration of rule.slice(rule.indexOf('{') + 1, rule.lastIndexOf('}')).split(';')) {
        if (declaration.trim()) expect(declaration).toContain('!important')
      }
    }
  })

  it('pins the reserved region id prefix and builds ids from it', () => {
    expect(CAROUSEL_ID_PREFIX).toBe('sb_carousel_')
    expect(carouselRegionId(1)).toBe('sb_carousel_1')
    expect(carouselRegionId(12)).toBe('sb_carousel_12')
  })
})

describe('BEHAVIOR_RUNTIME_SOURCE — carousel budget', () => {
  const gzipBytes = (): number => gzipSync(Buffer.from(BEHAVIOR_RUNTIME_SOURCE, 'utf8')).length

  it('stays within the cumulative gzip ceiling', () => {
    expect(gzipBytes()).toBeLessThanOrEqual(GZIP_CEILING_BYTES)
  })

  it('stays within this widget budget on top of the measured baseline', () => {
    expect(gzipBytes()).toBeLessThanOrEqual(GZIP_BUDGET_BYTES)
  })
})

describe('runtime source behavior — carousel', () => {
  // Every carousel below starts on its first slide, which is the state the
  // exporter markup must deliver: the runtime performs no initialization pass,
  // so a first-slide assumption here would be testing a feature it does not
  // have. The two-carousel fixture starts both sets at zero so "the other one
  // moved" cannot be confused with "it was already there".
  const carousel = (id: string, count: number): string => {
    const slide = (i: number) =>
      `<div data-sb-carousel-slide id="${id}-s${i}"${i === 0 ? '' : ' hidden'}>slide ${i}</div>`
    const rows = Array.from({ length: count }, (_unused, i) => i)
    return (
      `<div data-sb-carousel id="${id}">` +
      `<button type="button" data-sb-carousel-prev id="${id}-prev" disabled>Prev</button>` +
      `<button type="button" data-sb-carousel-next id="${id}-next">Next</button>` +
      rows.map(slide).join('') +
      '</div>'
    )
  }

  const markup = carousel('one', 3) + carousel('two', 3) + '<p id="plain">Not a carousel</p>'

  const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement
  const slides = (id: string): HTMLElement[] =>
    Array.from(byId(id).querySelectorAll('[data-sb-carousel-slide]')) as HTMLElement[]
  const visible = (id: string): number[] =>
    slides(id).flatMap((slide, index) => (slide.hidden ? [] : [index]))
  // A dispatched event, never `element.click()`: a click on a control that the
  // runtime just disabled still has to reach the delegated listener, because
  // that is exactly the path the end-of-list clamp has to survive.
  const click = (element: Element): void => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  const press = (target: Element, key: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event
  }

  beforeAll(() => {
    // Evaluated once for the whole file: the runtime installs delegated
    // document listeners and performs no per-page initialization work.
    new Function(BEHAVIOR_RUNTIME_SOURCE)()
  })

  beforeEach(() => {
    document.body.innerHTML = markup
  })

  it('never advances on its own', () => {
    // The source scan is the single load-bearing assertion, and it is a stronger
    // claim than "the slide did not move". A clock row is deliberately NOT used:
    // this harness evaluates the source once in `beforeAll` under real timers, so
    // a fake clock started afterwards cannot observe anything scheduled (or not
    // scheduled) at load — it could only watch state that never moved, and would
    // pass even if the runtime did install an autoplay timer.
    for (const token of ['setInterval', 'setTimeout', 'requestAnimationFrame']) {
      expect(BEHAVIOR_RUNTIME_SOURCE).not.toContain(token)
    }
  })

  it('advances exactly one slide on next', () => {
    click(byId('one-next'))
    expect(visible('one')).toEqual([1])
    expect(byId('one-prev').hasAttribute('disabled')).toBe(false)
    expect(byId('one-next').hasAttribute('disabled')).toBe(false)
  })

  it('returns exactly one slide on prev', () => {
    click(byId('one-next'))
    click(byId('one-prev'))
    expect(visible('one')).toEqual([0])
    expect(byId('one-prev').hasAttribute('disabled')).toBe(true)
  })

  it('does not wrap past the last slide and disables next there', () => {
    click(byId('one-next'))
    click(byId('one-next'))
    expect(visible('one')).toEqual([2])
    expect(byId('one-next').hasAttribute('disabled')).toBe(true)
    // The control is disabled, but a dispatched event still reaches the
    // listener: the index clamp — not the control state — is what holds here.
    click(byId('one-next'))
    expect(visible('one')).toEqual([2])
  })

  it('re-enables next after returning from the last slide', () => {
    click(byId('one-next'))
    click(byId('one-next'))
    expect(byId('one-next').hasAttribute('disabled')).toBe(true)
    click(byId('one-prev'))
    expect(visible('one')).toEqual([1])
    // A disable-only implementation would leave the control dead on slide 1.
    expect(byId('one-next').hasAttribute('disabled')).toBe(false)
    expect(byId('one-prev').hasAttribute('disabled')).toBe(false)
  })

  it('does not wrap before the first slide and keeps prev disabled', () => {
    expect(byId('one-prev').hasAttribute('disabled')).toBe(true)
    click(byId('one-prev'))
    expect(visible('one')).toEqual([0])
    expect(byId('one-prev').hasAttribute('disabled')).toBe(true)
  })

  it('resolves a click on a child of a control to the owning control', () => {
    byId('one-next').innerHTML = '<span id="next-label">Next</span>'
    click(byId('next-label'))
    expect(visible('one')).toEqual([1])
  })

  it('changes nothing when the click lands outside any control', () => {
    click(byId('plain'))
    click(document.body)
    expect(visible('one')).toEqual([0])
    expect(visible('two')).toEqual([0])
  })

  it('moves forward on ArrowRight and back on ArrowLeft inside the region', () => {
    press(byId('one-next'), 'ArrowRight')
    expect(visible('one')).toEqual([1])
    press(byId('one-prev'), 'ArrowLeft')
    expect(visible('one')).toEqual([0])
  })

  it('moves the slide when the key is pressed on a slide, not only on a control', () => {
    // Scope is ANCESTRY: any target inside the region works, not just the two
    // controls. An implementation that keyed off the control elements would
    // leave this row unmoved.
    press(slides('two')[0], 'ArrowRight')
    expect(visible('two')).toEqual([1])
    expect(visible('one')).toEqual([0])
  })

  it('ignores the arrow keys outside any carousel', () => {
    const event = press(byId('plain'), 'ArrowRight')
    expect(event.defaultPrevented).toBe(false)
    expect(visible('one')).toEqual([0])
  })

  it('leaves the other carousel untouched', () => {
    click(byId('two-next'))
    expect(visible('two')).toEqual([1])
    expect(visible('one')).toEqual([0])
    expect(byId('one-next').hasAttribute('disabled')).toBe(false)
  })

  it('suppresses the default of an arrow key that moves the slide', () => {
    expect(press(byId('one-next'), 'ArrowRight').defaultPrevented).toBe(true)
  })

  it('keeps two carousels independent when their region ids collide', () => {
    // Two blocks may share a block id, so the emitted markup can repeat the
    // region id. The runtime never reads an id — it walks up from the event
    // target — so each region must still move on its own.
    document.body.innerHTML =
      '<div data-sb-carousel id="same">' +
      '<button type="button" data-sb-carousel-next>Next</button>' +
      '<div data-sb-carousel-slide>a0</div><div data-sb-carousel-slide hidden>a1</div>' +
      '</div>' +
      '<div data-sb-carousel id="same">' +
      '<button type="button" data-sb-carousel-next>Next</button>' +
      '<div data-sb-carousel-slide>b0</div><div data-sb-carousel-slide hidden>b1</div>' +
      '</div>'
    const regions = Array.from(document.querySelectorAll('[data-sb-carousel]')) as HTMLElement[]
    const shownText = (region: HTMLElement): string[] =>
      Array.from(region.querySelectorAll('[data-sb-carousel-slide]'))
        .filter((slide) => !(slide as HTMLElement).hidden)
        .map((slide) => slide.textContent as string)

    click(regions[0].querySelector('[data-sb-carousel-next]') as HTMLElement)
    expect(shownText(regions[0])).toEqual(['a1'])
    expect(shownText(regions[1])).toEqual(['b0'])
    // Driven from the SECOND colliding region as well: an implementation that
    // resolved the owner with `getElementById(region.id)` would return the first
    // duplicate and move nothing here.
    click(regions[1].querySelector('[data-sb-carousel-next]') as HTMLElement)
    expect(shownText(regions[1])).toEqual(['b1'])
    expect(shownText(regions[0])).toEqual(['a1'])
    // Keys are scoped by ancestry too, so a press on a slide of the SECOND
    // colliding region moves that one only.
    press(regions[1].querySelector('[data-sb-carousel-slide]') as HTMLElement, 'ArrowLeft')
    expect(shownText(regions[1])).toEqual(['b0'])
    expect(shownText(regions[0])).toEqual(['a1'])
  })

  it('moves focus to the other control when next is disabled at the last slide', () => {
    byId('one-next').focus()
    expect(document.activeElement).toBe(byId('one-next'))
    click(byId('one-next'))
    click(byId('one-next'))
    expect(visible('one')).toEqual([2])
    expect(byId('one-next').hasAttribute('disabled')).toBe(true)
    // jsdom keeps focus on a disabled element, so this observes the runtime's
    // own recovery call rather than a browser blur.
    expect(document.activeElement).toBe(byId('one-prev'))
    // The keyboard path still works from where the focus landed.
    press(byId('one-prev'), 'ArrowLeft')
    expect(visible('one')).toEqual([1])
  })

  it('moves focus to the other control when prev is disabled at the first slide', () => {
    click(byId('one-next'))
    byId('one-prev').focus()
    expect(document.activeElement).toBe(byId('one-prev'))
    click(byId('one-prev'))
    expect(visible('one')).toEqual([0])
    expect(byId('one-prev').hasAttribute('disabled')).toBe(true)
    expect(document.activeElement).toBe(byId('one-next'))
    press(byId('one-next'), 'ArrowRight')
    expect(visible('one')).toEqual([1])
    // The recovery stays inside its own region.
    expect(document.activeElement).toBe(byId('one-next'))
    expect(byId('two-next').hasAttribute('disabled')).toBe(false)
    expect(visible('two')).toEqual([0])
  })

  it('leaves the default alone at a boundary so page scrolling still works', () => {
    press(byId('one-next'), 'ArrowRight')
    press(byId('one-next'), 'ArrowRight')
    expect(visible('one')).toEqual([2])
    expect(press(byId('one-next'), 'ArrowRight').defaultPrevented).toBe(false)
    expect(visible('one')).toEqual([2])
    // The second carousel is still on its first slide, where ArrowLeft has
    // nowhere to go either.
    expect(press(byId('two-prev'), 'ArrowLeft').defaultPrevented).toBe(false)
    expect(visible('two')).toEqual([0])
  })
})
