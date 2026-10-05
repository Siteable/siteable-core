import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { isAllowedUrl } from '@/lib/url-policy'
import { defaultGalleryImages } from '@/lib/block-default-content'

/**
 * `gallery` block (variants: grid default, masonry).
 *
 * Each item's `src` goes through the image URL policy; a rejected or empty
 * source renders the gradient placeholder instead of a live `<img>`. Captions
 * are escaped text. The `masonry` variant marks every third cell `row-span-2`.
 */
const IMAGE_ICON_24 =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-3"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'

interface GalleryImage {
  src?: string
  alt?: string
  caption?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function renderGallery(block: BlockConfig): string {
  const props = block.props
  const title = typeof props.title === 'string' ? props.title : ''
  const rawImages = Array.isArray(props.images) ? props.images : []
  const images: unknown[] = rawImages.length > 0 ? rawImages : defaultGalleryImages
  const isMasonry = block.variant === 'masonry'

  const titleHtml = title
    ? `      <h2 class="text-2xl font-semibold mb-6 text-center">${escapeHtml(title)}</h2>`
    : ''

  const cards = images
    .filter(isObject)
    .map((img, i) => {
      const item = img as GalleryImage
      const src = typeof item.src === 'string' ? item.src : ''
      const alt = typeof item.alt === 'string' ? item.alt : ''
      const caption = typeof item.caption === 'string' ? item.caption : ''
      const tall = isMasonry && i % 3 === 0
      const inner =
        src && isAllowedUrl(src, { image: true })
          ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="w-full h-full object-cover" />`
          : `<div class="w-full h-full min-h-[140px] bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center">${IMAGE_ICON_24}</div>`
      const captionHtml = caption
        ? `<div class="px-3 py-2 bg-bg-2 text-[11px] text-text-2">${escapeHtml(caption)}</div>`
        : ''
      return `        <div class="rounded-lg overflow-hidden border border-border-default${tall ? ' row-span-2' : ''}">${inner}${captionHtml}</div>`
    })
    .join('\n')

  const gridClass = isMasonry
    ? 'grid grid-cols-2 md:grid-cols-3 auto-rows-[160px] gap-3'
    : 'grid grid-cols-2 md:grid-cols-3 gap-3'

  return `  <div class="px-6 md:px-10 py-12 md:py-16">
${titleHtml}
      <div class="${gridClass}">
${cards}
      </div>
    </div>`
}
