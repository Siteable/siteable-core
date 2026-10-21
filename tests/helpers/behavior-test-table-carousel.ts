/**
 * Carousel cases and observation for the shared behavior table.
 *
 * Both environments expose the same ARIA contract (`role="region"` with
 * `aria-roledescription="carousel"`, `role="group"` slides labelled `"{n} of {m}"`,
 * controls named by `aria-label`), so rows are queried by role and name with no
 * adapter method. The editor carries no `data-sb-*` hook: the export runtime
 * ignores a carousel it cannot find that way.
 */
import type { BehaviorAdapter, BehaviorCase, ExpectedView } from './behavior-test-table'
import { panelHasTransition, type TabSetView, type TabStep } from './behavior-test-table-tabs'

/** The two control names are a frozen contract in both environments. */
export const PREV_LABEL = 'Previous slide'
export const NEXT_LABEL = 'Next slide'

export type ControlView = { label: string; disabled: boolean; visible: boolean }

/** One carousel region, observed in document order. */
export interface CarouselView {
  visible: boolean[] // per slide: !hidden — exactly one is shown
  positions: string[] // per slide: the aria-label position text
  named: boolean // named by a heading of its own, not by a bare label
  slidesLabel: boolean // every slide is a group carrying its "{n} of {m}"
  controls: { prev: ControlView; next: ControlView }
  noStyleTrap: boolean // no slide animates or overrides `hidden` with a display
  uniqueIds: boolean // every id in the document is non-empty and unique
}

/** Tailwind display utilities that would beat the `hidden` attribute. */
const DISPLAY_TOKENS = ['block', 'flex', 'grid', 'inline', 'inline-block', 'inline-flex', 'hidden']
/** The variant suffix counts: `@md:flex` beats `hidden` just like `flex` does. */
const isDisplayToken = (token: string): boolean => DISPLAY_TOKENS.includes(token.split(':').pop() ?? '')

export type CarouselStep =
  | { kind: 'clickCarousel'; carousel: number; which: 'prev' | 'next' }
  | { kind: 'focusCarousel'; carousel: number; which: 'prev' | 'next' }

export function carouselRegions(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="region"][aria-roledescription="carousel"]'))
}

export const slidesIn = (region: Element): HTMLElement[] =>
  Array.from(region.querySelectorAll<HTMLElement>('[role="group"][aria-roledescription="slide"]'))

export function control(region: Element, which: 'prev' | 'next'): HTMLButtonElement | null {
  const label = which === 'prev' ? PREV_LABEL : NEXT_LABEL
  return region.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
}

/** A region with a heading must be named by THAT heading; otherwise by `aria-label`. */
function isNamed(region: Element): boolean {
  const heading = Array.from(region.querySelectorAll('h1,h2,h3,h4,h5,h6')).find(
    (candidate) => (candidate.textContent ?? '').trim() !== '',
  )
  if (!heading) return (region.getAttribute('aria-label') ?? '').trim() !== ''
  const labelledBy = region.getAttribute('aria-labelledby') ?? ''
  return labelledBy !== '' && region.contains(document.getElementById(labelledBy))
}

function idsAreUnique(): boolean {
  const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map((element) => element.id)
  return ids.length > 0 && ids.every((id) => id !== '') && ids.length === new Set(ids).size
}

export function carouselView(region: Element): CarouselView {
  const slides = slidesIn(region)
  const view = (which: 'prev' | 'next'): ControlView => {
    const element = control(region, which)
    return { label: element?.getAttribute('aria-label') ?? '', disabled: !!element?.disabled, visible: !!element && !element.hidden }
  }
  return {
    visible: slides.map((slide) => !slide.hidden),
    positions: slides.map((slide) => slide.getAttribute('aria-label') ?? ''),
    named: isNamed(region),
    slidesLabel: slides.every((slide, index) => slide.getAttribute('role') === 'group'
      && slide.getAttribute('aria-roledescription') === 'slide'
      && slide.getAttribute('aria-label') === `${index + 1} of ${slides.length}`),
    controls: { prev: view('prev'), next: view('next') },
    noStyleTrap: slides.every((slide) => !panelHasTransition(slide) && slide.style.display === ''
      && !Array.from(slide.classList).some((token) => isDisplayToken(token))),
    uniqueIds: idsAreUnique(),
  }
}

/** The focused control as [region index, control], or null when none. */
export function focusedCarouselControl(): [number, 'prev' | 'next'] | null {
  const regions = carouselRegions()
  for (let index = 0; index < regions.length; index += 1) {
    const which = (['prev', 'next'] as const).find(
      (candidate) => control(regions[index], candidate) === document.activeElement,
    )
    if (which) return [index, which]
  }
  return null
}

/** Observe only the carousel fields the case expects. */
export function observeCarousels(expected: ExpectedView): Record<string, unknown> {
  const view: Record<string, unknown> = {}
  if (expected.carousels) view.carousels = carouselRegions().map(carouselView)
  if (expected.focusCarousel !== undefined) view.focusCarousel = focusedCarouselControl()
  return view
}

/** A row may never activate a disabled control (unfocusable in a browser); fails loudly. */
export function applyCarouselStep(adapter: BehaviorAdapter, step: CarouselStep): void {
  const region = carouselRegions()[step.carousel]
  if (!region) throw new Error(`no carousel region at index ${step.carousel}`)
  const target = control(region, step.which)
  if (!target) throw new Error(`no ${step.which} control in carousel ${step.carousel}`)
  if (step.kind === 'clickCarousel') {
    if (target.disabled) throw new Error(`cannot activate a disabled ${step.which} control`)
    adapter.click(target)
    return
  }
  target.focus()
  if (document.activeElement !== target) throw new Error(`${step.which} control did not receive focus`)
}

const carouselState = (shown: number, count: number): CarouselView => ({
  visible: Array.from({ length: count }, (_, index) => index === shown),
  positions: Array.from({ length: count }, (_, index) => `${index + 1} of ${count}`),
  named: true,
  slidesLabel: true,
  controls: { prev: { label: PREV_LABEL, disabled: shown === 0, visible: true },
    next: { label: NEXT_LABEL, disabled: shown === count - 1, visible: true } },
  noStyleTrap: true,
  uniqueIds: true,
})
/** The tab contract, for rows that prove the other widget did not move. */
const tabState = (selected: number, count = 3): TabSetView => ({
  selected: Array.from({ length: count }, (_, index) => index === selected),
  visible: Array.from({ length: count }, (_, index) => index === selected),
  tabStops: Array.from({ length: count }, (_, index) => index === selected),
  wired: true,
  noTransition: true,
})

const clickCarousel = (carousel: number, which: 'prev' | 'next'): CarouselStep =>
  ({ kind: 'clickCarousel', carousel, which })
const focusCarousel = (carousel: number, which: 'prev' | 'next'): CarouselStep =>
  ({ kind: 'focusCarousel', carousel, which })
const focusTab = (set: number, index: number): TabStep => ({ kind: 'focusTab', set, index })
const key = (value: string) => ({ kind: 'key' as const, key: value })
export const CAROUSEL_CASES: BehaviorCase[] = [
  { id: 'C1', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [], expect: { carousels: [carouselState(0, 3)] } },
  { id: 'C2', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [clickCarousel(0, 'next')], expect: { carousels: [carouselState(1, 3)] } },
  { id: 'C3', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [clickCarousel(0, 'next'), clickCarousel(0, 'next')], expect: { carousels: [carouselState(2, 3)] } },
  { id: 'C4', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [clickCarousel(0, 'next'), clickCarousel(0, 'next'), focusCarousel(0, 'prev'), key('ArrowLeft')], expect: { carousels: [carouselState(1, 3)], focusCarousel: [0, 'prev'] } },
  { id: 'C5', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [focusCarousel(0, 'next'), key('ArrowRight')], expect: { carousels: [carouselState(1, 3)], focusCarousel: [0, 'next'] } },
  { id: 'C6', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [focusCarousel(0, 'next'), key('ArrowLeft')], expect: { carousels: [carouselState(0, 3)] } },
  { id: 'C7', behavior: 'carousel', fixture: 'carousel-gallery', steps: [clickCarousel(0, 'next')], expect: { carousels: [carouselState(1, 4)] } },
  { id: 'C8', behavior: 'carousel', fixture: 'two-carousels', steps: [clickCarousel(1, 'next')], expect: { carousels: [carouselState(0, 3), carouselState(1, 4)] } },
  { id: 'C9', behavior: 'carousel', fixture: 'carousels-shared-id', steps: [clickCarousel(1, 'next')], expect: { carousels: [carouselState(0, 3), carouselState(1, 3)] } },
  // A key on the tab set moves the tab set and leaves the carousel alone.
  { id: 'C10', behavior: 'carousel', fixture: 'carousel-and-tabs', steps: [focusTab(0, 0), key('ArrowRight')], expect: { tabs: [tabState(1)], carousels: [carouselState(0, 3)] } },
  // A key on the carousel moves the carousel and leaves the tab set alone.
  { id: 'C11', behavior: 'carousel', fixture: 'carousel-and-tabs', steps: [focusCarousel(0, 'next'), key('ArrowRight')], expect: { carousels: [carouselState(1, 3)], tabs: [tabState(0)] } },
  // State-only row: the carousel never animates; the class rule is pinned in the markup suite.
  { id: 'C12', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [{ kind: 'reducedMotion', on: true }, clickCarousel(0, 'next')], expect: { carousels: [carouselState(1, 3)] } },
  // The display option wins over the static scroller look.
  { id: 'C13', behavior: 'carousel', fixture: 'carousel-scroller-variant', steps: [], expect: { carousels: [carouselState(0, 2)] } },
  { id: 'C14', behavior: 'carousel', fixture: 'carousel-gallery', steps: [], expect: { carousels: [carouselState(0, 4)] } },
  // The shared table must carry a PREVIOUS row: activate the control, not just focus it.
  { id: 'C15', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [clickCarousel(0, 'next'), clickCarousel(0, 'prev')], expect: { carousels: [carouselState(0, 3)] } },
  // Focus recovery at an end: the activated control is disabled, so focus must move to the other one.
  { id: 'C16', behavior: 'carousel', fixture: 'carousel-testimonials', steps: [clickCarousel(0, 'next'), clickCarousel(0, 'next')], expect: { carousels: [carouselState(2, 3)], focusCarousel: [0, 'prev'] } },
]
