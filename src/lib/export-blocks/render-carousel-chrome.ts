import { escapeHtml } from '@/lib/html-escape'

/**
 * Shared chrome for the two carousel renderers: the labelled region, the two
 * controls and the class lists the hidden-attribute contract depends on.
 *
 * The slide class list carries no display utility and no transition, so the
 * user agent's `[hidden]` rule (and the no-script override) always wins — a
 * display utility here would leave every slide visible. The region is named by
 * the visible heading when the block has one, and by `aria-label` otherwise.
 * The controls start with `previous` disabled because the first slide is shown.
 *
 * Each item renderer keeps its own card template: the default layouts are
 * byte-pinned and this opt-in path must not refactor them.
 */
export const SLIDE_CLASS = 'rounded-xl focus:outline-none'
export const CONTROL_CLASS =
  'min-h-[40px] min-w-[40px] w-10 h-10 rounded-full border border-border-default bg-bg-2 flex items-center justify-center text-text-2 hover:text-text-0 hover:border-border-hover disabled:opacity-40 disabled:cursor-not-allowed'

const SVG_CHEVRON_LEFT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>'
const SVG_CHEVRON_RIGHT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>'

/** The heading id a region points at; content-free by construction, escaped anyway. */
export const carouselHeadingId = (regionId: string): string => `${escapeHtml(regionId)}title`

/**
 * An entry may be null or a primitive in AI-generated props; every item renderer
 * reads them through these two guards so a hostile list degrades to empty slides
 * instead of throwing or stringifying (`[object Object]`, `undefined`).
 */
export const entryOf = <T extends object>(raw: unknown): T =>
  (raw && typeof raw === 'object' ? (raw as T) : ({} as T))

/** Values reach text and attributes only as escaped strings; non-strings are absent. */
export const textOf = (value: unknown): string => (typeof value === 'string' ? value : '')

function controls(): string {
  return `      <div class="flex items-center justify-center gap-4 mt-6">
        <button type="button" data-sb-carousel-prev aria-label="Previous slide" disabled class="${CONTROL_CLASS}">${SVG_CHEVRON_LEFT}</button>
        <button type="button" data-sb-carousel-next aria-label="Next slide" class="${CONTROL_CLASS}">${SVG_CHEVRON_RIGHT}</button>
      </div>`
}

/**
 * Wrap the slide markup in its labelled region.
 *
 * `headingId` is the id the caller put on its heading, or an empty string when
 * the block has no title — then the region is named by `aria-label` instead, so
 * it is never an unnamed region.
 */
export function carouselShell(
  regionId: string,
  headingId: string,
  header: string,
  slides: string,
): string {
  const labelled = headingId
    ? ` aria-labelledby="${headingId}"`
    : ' aria-label="Carousel"'

  return `  <section role="region" aria-roledescription="carousel"${labelled} data-sb-carousel class="px-6 md:px-10 py-16 md:py-20">
${header}      <div class="relative">
${slides}
      </div>
${controls()}
  </section>`
}
