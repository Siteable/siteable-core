import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { imgHintAttrs } from '@/lib/export-img-hints'
import { isAllowedUrl } from '@/lib/url-policy'
import { defaultGalleryImages } from '@/lib/block-default-content'
import { SLIDE_CLASS, carouselHeadingId, carouselShell, entryOf, textOf } from './render-carousel-chrome'

/**
 * `gallery` block rendered as a carousel — the opt-in `display: "carousel"`
 * layout. The variant is IGNORED: grid and masonry both render the carousel,
 * because the slide is the frame and the layout's row spans have no meaning
 * once only one slide is visible.
 *
 * One slide per entry, in entry order; the first slide is shown and the rest
 * are hidden through the `hidden` ATTRIBUTE alone (see the shared chrome for the
 * class-list rule). Each source goes through the image URL policy; a rejected or
 * empty source renders the gradient placeholder instead of a live `<img>`,
 * exactly as the default renderer does. Captions are escaped text.
 *
 * The markup roots at a `<section>` — unlike the default layout's `<div>` — so
 * the block is a semantically labelled region. The item card duplicates the
 * default renderer's markup by design: that renderer is byte-pinned.
 */
const IMAGE_ICON_24 =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-3"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'

interface GalleryImage {
  src?: unknown
  alt?: unknown
  caption?: unknown
}

/** An entry may be null or a primitive in AI-generated props; read defensively. */
const entry = (raw: unknown): GalleryImage =>
  raw && typeof raw === 'object' ? (raw as GalleryImage) : {}
/** Values reach text and attributes only as escaped strings; non-strings are absent. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function renderGalleryCarousel(block: BlockConfig, regionId: string): string {
  const props = block.props
  const titleText = textOf(props.title)
  const rawImages = Array.isArray(props.images) ? props.images : []
  const images: unknown[] = rawImages.length > 0 ? rawImages : defaultGalleryImages
  const headingId = carouselHeadingId(regionId)
  const hasTitle = titleText.trim() !== ''

  const header = hasTitle
    ? `      <div class="text-center mb-10">
        <h2 id="${headingId}" class="text-2xl md:text-3xl font-bold tracking-tight mb-2">${escapeHtml(titleText)}</h2>
      </div>
`
    : ''

  const total = images.length
  const slides = images.map((raw, index) => {
    const item = entryOf<GalleryImage>(raw)
    const src = textOf(item.src)
    const caption = textOf(item.caption)
    const inner =
      src && isAllowedUrl(src, { image: true })
        ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(textOf(item.alt))}" class="w-full h-full object-cover"${imgHintAttrs('lazy')} />`
        : `<div class="w-full h-full min-h-[140px] bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center">${IMAGE_ICON_24}</div>`
    const captionHtml = caption
      ? `<div class="px-3 py-2 bg-bg-2 text-[11px] text-text-2">${escapeHtml(caption)}</div>`
      : ''

    const n = index + 1
    return `        <div role="group" aria-roledescription="slide" aria-label="${n} of ${total}" data-sb-carousel-slide${n === 1 ? '' : ' hidden'} class="${SLIDE_CLASS}">
          <div class="rounded-lg overflow-hidden border border-border-default">${inner}${captionHtml}</div>
        </div>`
  })

  return carouselShell(regionId, hasTitle ? headingId : '', header, slides.join('\n'))
}
