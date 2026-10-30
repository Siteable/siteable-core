import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { clampFacebookPageHeight, facebookPageEmbedUrl } from '@/lib/facebook-page-embed'

/**
 * `facebook-page` block (variant: default) — a Facebook Page timeline embed.
 *
 * The iframe `src` is built ONLY from the shared `facebookPageEmbedUrl`
 * function — never from the raw stored value — so a malformed or hostile url
 * can never reach the attribute. When that function returns `null`, no
 * `<iframe>` is emitted at all; the placeholder renders instead. The frame
 * height is the integer from the shared clamp, never a raw string. No script
 * is emitted.
 */
const THUMBS_UP_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-3"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>'

export function renderFacebookPage(block: BlockConfig): string {
  const title = typeof block.props.title === 'string' ? block.props.title : ''
  const embedUrl = facebookPageEmbedUrl(block.props.url, block.props.height)
  const height = clampFacebookPageHeight(block.props.height)

  const titleHtml = title
    ? `      <h2 class="text-xl font-semibold mb-4 text-center">${escapeHtml(title)}</h2>`
    : ''

  const body = embedUrl
    ? `      <div class="w-full rounded-lg overflow-hidden border border-border-default" style="max-width:340px;margin:0 auto"><iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(title || 'Facebook Page')}" width="340" height="${height}" style="display:block;width:100%;border:0" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : `      <div class="w-full aspect-video bg-gradient-to-br from-bg-3 to-bg-4 rounded-lg flex items-center justify-center" style="max-width:340px;margin:0 auto"><div class="w-14 h-14 rounded-full bg-bg-5/50 border border-border-default flex items-center justify-center">${THUMBS_UP_ICON}</div></div>`

  return `  <div class="px-6 md:px-10 py-12 md:py-16">
${titleHtml}
${body}
  </div>`
}
