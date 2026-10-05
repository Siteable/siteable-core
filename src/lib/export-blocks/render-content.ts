import type { BlockConfig } from '@/blocks/types'
import { renderMarkdownToHtml } from '@/lib/markdown-html'

/**
 * `content` block (variants: prose default, columns, highlight).
 *
 * The body is rendered through the markdown-subset STRING renderer, which
 * escapes every literal text run. The root element is the first tag returned
 * (phase 06 depends on this). Markup uses the exporter's Tailwind vocabulary
 * (`px-6 md:px-10`, `text-text-*`, `rounded-lg`), not the React blocks'
 * container-query classes.
 */
export function renderContent(block: BlockConfig): string {
  const body = typeof block.props.body === 'string' ? block.props.body : ''
  const html = renderMarkdownToHtml(body)

  if (block.variant === 'columns') {
    // Split between top-level elements only — the renderer joins top-level
    // elements with '\n', so no split lands inside a tag.
    const parts = html.split('\n')
    const mid = Math.ceil(parts.length / 2)
    const left = parts.slice(0, mid).join('\n')
    const right = parts.slice(mid).join('\n')
    return `  <div class="px-6 md:px-10 py-12 md:py-16">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        <div>${left}</div>
        <div>${right}</div>
      </div>
    </div>`
  }

  if (block.variant === 'highlight') {
    return `  <div class="px-6 md:px-10 py-12 md:py-16">
      <div class="border-l-2 border-green pl-6 md:pl-8 bg-green/5 rounded-r-lg py-6 px-4">${html}</div>
    </div>`
  }

  // prose (default)
  return `  <div class="px-6 md:px-10 py-12 md:py-16 max-w-3xl mx-auto">${html}</div>`
}
