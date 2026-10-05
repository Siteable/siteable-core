import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { isAllowedUrl } from '@/lib/url-policy'
import { defaultImageGridItems } from '@/lib/block-default-content'

/**
 * `image` block (variants: hero-image default, side-by-side, grid).
 *
 * An `<img>` is emitted ONLY when the `src` passes the image URL policy
 * (`https:` only); a rejected or empty source degrades to the same gradient
 * placeholder shape the React block uses, so a stored `data:` URL never
 * becomes a live image (SC-011).
 */
const IMAGE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-3"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'

function placeholder(className: string): string {
  return `<div class="bg-gradient-to-br from-bg-3 to-bg-4 flex items-center justify-center ${className}">${IMAGE_ICON}</div>`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function renderImage(block: BlockConfig): string {
  const props = block.props
  const src = typeof props.src === 'string' ? props.src : ''
  const alt = typeof props.alt === 'string' ? props.alt : ''
  const title = typeof props.title === 'string' ? props.title : ''
  const subtitle = typeof props.subtitle === 'string' ? props.subtitle : ''
  const imageSide = typeof props.imageSide === 'string' ? props.imageSide : 'left'
  const srcOk = isAllowedUrl(src, { image: true })

  if (block.variant === 'side-by-side') {
    const imgHtml = srcOk
      ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="w-full h-full object-cover rounded-lg" />`
      : placeholder('w-full h-64 md:h-80 rounded-lg')
    const imageCellClass = imageSide === 'right' ? 'md:order-2' : ''
    const textCellClass = imageSide === 'right' ? 'md:order-1' : ''
    const titleHtml = title
      ? `<h2 class="text-2xl font-semibold mb-3">${escapeHtml(title)}</h2>`
      : ''
    const subtitleHtml = subtitle
      ? `<p class="text-text-1 leading-relaxed">${escapeHtml(subtitle)}</p>`
      : ''
    return `  <div class="px-6 md:px-10 py-12 md:py-16">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
        <div class="${imageCellClass}">${imgHtml}</div>
        <div class="${textCellClass}">${titleHtml}${subtitleHtml}</div>
      </div>
    </div>`
  }

  if (block.variant === 'grid') {
    const rawImages = Array.isArray(props.images) ? props.images : []
    const gridImages = rawImages.length > 0 ? rawImages.slice(0, 4) : defaultImageGridItems
    const gridTitleHtml = title
      ? `<h2 class="text-2xl font-semibold mb-6 text-center">${escapeHtml(title)}</h2>`
      : ''
    const cells = gridImages
      .filter(isObject)
      .map((img) => {
        const imgSrc = typeof img.src === 'string' ? img.src : ''
        const imgAlt = typeof img.alt === 'string' ? img.alt : ''
        const inner = isAllowedUrl(imgSrc, { image: true })
          ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(imgAlt)}" class="w-full h-full object-cover" />`
          : placeholder('w-full h-full')
        return `        <div class="aspect-square rounded-lg overflow-hidden">${inner}</div>`
      })
      .join('\n')
    return `  <div class="px-6 md:px-10 py-12 md:py-16">
${gridTitleHtml}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
${cells}
      </div>
    </div>`
  }

  // hero-image (default)
  const heroImgHtml = srcOk
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="w-full h-64 md:h-96 object-cover" />`
    : placeholder('w-full h-64 md:h-96')
  const overlayTitle = title
    ? `<h2 class="text-2xl md:text-3xl font-bold mb-2">${escapeHtml(title)}</h2>`
    : ''
  const overlaySubtitle = subtitle
    ? `<p class="text-text-1 text-sm md:text-base max-w-lg">${escapeHtml(subtitle)}</p>`
    : ''
  const overlay =
    overlayTitle || overlaySubtitle
      ? `    <div class="absolute inset-0 bg-gradient-to-t from-bg-0/80 to-transparent flex flex-col justify-end p-6 md:p-12">${overlayTitle}${overlaySubtitle}</div>`
      : ''
  return `  <div class="relative">
${heroImgHtml}
${overlay}
  </div>`
}
