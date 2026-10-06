import type { BlockConfig } from '@/blocks/types'
import { escapeHtml } from '@/lib/html-escape'
import { videoEmbedUrl } from '@/lib/video-embed'

/**
 * `video` block (variants: youtube default, vimeo).
 *
 * The iframe `src` is built ONLY from the id extracted from `url` — never from
 * the raw stored value — so a malformed or hostile url can never reach the
 * attribute (SC-009). When no id is extracted, no `<iframe>` is emitted at all;
 * the placeholder renders instead.
 */
const PLAY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-text-3"><polygon points="6 3 20 12 6 21 6 3"/></svg>'

export function renderVideo(block: BlockConfig): string {
  const url = typeof block.props.url === 'string' ? block.props.url : ''
  const title = typeof block.props.title === 'string' ? block.props.title : ''
  const embedUrl = videoEmbedUrl(url, block.variant)

  const titleHtml = title
    ? `      <h2 class="text-xl font-semibold mb-4 text-center">${escapeHtml(title)}</h2>`
    : ''

  const body = embedUrl
    ? `      <div class="w-full aspect-video rounded-lg overflow-hidden border border-border-default"><iframe src="${escapeHtml(embedUrl)}" title="${escapeHtml(title || 'Video')}" class="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
    : `      <div class="w-full aspect-video bg-gradient-to-br from-bg-3 to-bg-4 rounded-lg flex items-center justify-center"><div class="w-14 h-14 rounded-full bg-bg-5/50 border border-border-default flex items-center justify-center">${PLAY_ICON}</div></div>`

  return `  <div class="px-6 md:px-10 py-12 md:py-16">
${titleHtml}
${body}
  </div>`
}
