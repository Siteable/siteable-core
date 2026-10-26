import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { imgHintAttrs } from '@/lib/export-img-hints'
import { isAllowedUrl } from '@/lib/url-policy'
import { prop } from '@/lib/render-prop'
import { defaultTestimonials } from '@/lib/block-default-content'
import { SLIDE_CLASS, carouselHeadingId, carouselShell, entryOf, textOf } from './render-carousel-chrome'

/**
 * `testimonials` block rendered as a carousel — the opt-in `display: "carousel"`
 * layout, for every variant. One slide per item, in item order; only the first
 * is shown, the rest are hidden through the `hidden` ATTRIBUTE alone (the shared
 * chrome owns the class-list rule). `regionId` comes from the exporter's
 * per-document counter, so the heading id is deterministic, unique per document
 * even when two blocks share one block id, and content-free. The item card
 * duplicates the default renderer's markup by design: that renderer is
 * byte-pinned and must not be refactored for an opt-in path.
 */
const SVG_QUOTE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/></svg>'
const SVG_STAR_FILLED = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
const SVG_STAR_EMPTY = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'

interface TestimonialItem {
  name?: unknown
  role?: unknown
  quote?: unknown
  rating?: unknown
  avatar?: unknown
}

const initials = (name: string): string => escapeHtml(name.split(' ').map((part) => part.charAt(0)).join(''))

function stars(rating: number): string {
  const cells = [1, 2, 3, 4, 5].map(
    (i) => `<span class="${i <= rating ? 'text-yellow-400' : 'text-text-3'}">${i <= rating ? SVG_STAR_FILLED : SVG_STAR_EMPTY}</span>`,
  )
  return `<div class="flex gap-0.5">${cells.join('')}</div>`
}

export function renderTestimonialsCarousel(block: BlockConfig, regionId: string): string {
  const titleText = textOf(prop<unknown>(block.props, 'title', 'What people say'))
  const subtitle = textOf(prop<unknown>(block.props, 'subtitle', ''))
  const items = prop<unknown[]>(block.props, 'items', defaultTestimonials)
  const headingId = carouselHeadingId(regionId)
  const hasTitle = titleText.trim() !== ''

  const heading = hasTitle
    ? `        <h2 id="${headingId}" class="text-2xl md:text-3xl font-bold tracking-tight mb-2">${escapeHtml(titleText)}</h2>\n`
    : ''
  const subline = subtitle
    ? `        <p class="text-text-2 text-sm max-w-lg mx-auto">${escapeHtml(subtitle)}</p>\n`
    : ''
  const header =
    heading || subline ? `      <div class="text-center mb-10">\n${heading}${subline}      </div>\n` : ''

  const total = items.length
  const slides = items.map((raw, index) => {
    const item = entryOf<TestimonialItem>(raw)
    const name = textOf(item.name)
    const role = textOf(item.role)
    const rating = typeof item.rating === 'number' ? item.rating : 0
    const avatar = textOf(item.avatar)
    const ratingHtml = rating > 0 ? `\n            ${stars(rating)}` : ''
    const picture =
      avatar && isAllowedUrl(avatar)
        ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" class="w-9 h-9 rounded-full object-cover border border-border-default"${imgHintAttrs('lazy')} />`
        : `<div class="w-9 h-9 rounded-full bg-bg-4 border border-border-default flex items-center justify-center text-[11px] font-semibold text-text-2">${initials(name)}</div>`

    const n = index + 1
    return `        <div role="group" aria-roledescription="slide" aria-label="${n} of ${total}" data-sb-carousel-slide${n === 1 ? '' : ' hidden'} class="${SLIDE_CLASS}">
          <div class="bg-bg-2 border border-border-default rounded-xl p-5">
            <span class="text-green/30 block mb-3">${SVG_QUOTE}</span>
            <p class="text-[13px] text-text-1 leading-relaxed mb-4 italic">"${escapeHtml(textOf(item.quote))}"</p>${ratingHtml}
            <div class="flex items-center gap-3 mt-4 pt-4 border-t border-border-subtle">
              ${picture}
              <div>
                <div class="text-[12.5px] font-semibold">${escapeHtml(name)}</div>
                <div class="text-[11px] text-text-3">${escapeHtml(role)}</div>
              </div>
            </div>
          </div>
        </div>`
  })

  return carouselShell(regionId, hasTitle ? headingId : '', header, slides.join('\n'))
}
