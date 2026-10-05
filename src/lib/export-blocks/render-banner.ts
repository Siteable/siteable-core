import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { renderLink } from '@/lib/render-link'

/**
 * `banner` block (variants: ribbon default, bar).
 *
 * The optional CTA goes through the shared `renderLink`, so a `linkUrl` the
 * policy rejects (`javascript:`) degrades to a `<span>` rather than an anchor
 * (SC-011). Text props are coerced defensively and escaped.
 */
const RIBBON_LINK_CLASS =
  'text-[12.5px] font-semibold text-green hover:text-green-dim transition-colors flex items-center gap-1'
const BAR_LINK_CLASS =
  'text-[13px] font-medium text-green hover:text-green-dim transition-colors flex items-center gap-1 shrink-0'

export function renderBanner(block: BlockConfig): string {
  const props = block.props
  const rawText = typeof props.text === 'string' ? props.text : ''
  const text = rawText || 'Announcement'
  const linkText = typeof props.linkText === 'string' ? props.linkText : ''
  const rawLinkUrl = typeof props.linkUrl === 'string' ? props.linkUrl : ''
  const linkUrl = rawLinkUrl || '#'

  if (block.variant === 'bar') {
    const linkHtml = linkText ? renderLink(linkText, linkUrl, BAR_LINK_CLASS) : ''
    return `  <div class="px-6 md:px-10 py-3">
      <div class="flex items-center justify-between gap-4 px-5 py-3.5 rounded-lg border border-border-default bg-bg-2">
        <span class="text-[13px] text-text-1">${escapeHtml(text)}</span>
        ${linkHtml}
      </div>
    </div>`
  }

  // ribbon (default)
  const linkHtml = linkText ? renderLink(linkText, linkUrl, RIBBON_LINK_CLASS) : ''
  return `  <div class="flex items-center justify-center gap-3 px-4 py-2.5 bg-green/10 border-b border-green/20">
    <span class="text-[12.5px] text-text-0 font-medium">${escapeHtml(text)}</span>
    ${linkHtml}
  </div>`
}
