import { escapeHtml } from './html-escape'

/**
 * Markdown-subset → HTML STRING renderer. This is a new emitter, separate from
 * the React renderer in `src/lib/markdown.ts` (which stays untouched).
 *
 * Subset: `##` / `###` headers, `**bold**`, `*italic*`, `-` / `*` list items,
 * and paragraphs. No link syntax, no raw-HTML passthrough.
 *
 * Security model (SC-007, SC-008, NF-003): the line loop and the inline
 * splitter are ported from the React renderer so the parse structure matches,
 * but every literal text run is passed through `escapeHtml` before it is
 * concatenated. Structural tags are the ONLY raw markup in the output; no
 * character of the input is ever emitted as markup.
 *
 * Top-level elements are joined with `\n` and each element is single-line, so
 * the `content` block's `columns` variant can split between top-level elements
 * without cutting through a tag.
 */
export function renderMarkdownToHtml(md: string): string {
  const lines = md.split('\n')
  const elements: string[] = []
  let listItems: string[] = []

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        `<ul class="list-disc list-inside space-y-1 mb-4 text-text-1">${listItems.join('')}</ul>`
      )
      listItems = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Empty line
    if (!trimmed) {
      flushList()
      continue
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      flushList()
      elements.push(
        `<h3 class="text-lg font-semibold font-display mb-2 mt-4">${inlineFormat(trimmed.slice(4))}</h3>`
      )
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushList()
      elements.push(
        `<h2 class="text-xl font-semibold font-display mb-3 mt-5">${inlineFormat(trimmed.slice(3))}</h2>`
      )
      continue
    }

    // List item
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`)
      continue
    }

    // Paragraph
    flushList()
    elements.push(
      `<p class="text-text-1 leading-relaxed mb-3">${inlineFormat(trimmed)}</p>`
    )
  }

  flushList()
  return elements.join('\n')
}

/** Same earliest-match bold/italic algorithm as the React `inlineFormat`. */
function inlineFormat(text: string): string {
  const parts: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/)

    // Find earliest match
    const boldIdx = boldMatch?.index ?? Infinity
    const italicIdx = italicMatch?.index ?? Infinity

    if (boldIdx === Infinity && italicIdx === Infinity) {
      parts.push(escapeHtml(remaining))
      break
    }

    if (boldIdx <= italicIdx && boldMatch) {
      if (boldIdx > 0) parts.push(escapeHtml(remaining.slice(0, boldIdx)))
      parts.push(
        `<strong class="font-semibold text-text-0">${escapeHtml(boldMatch[1])}</strong>`
      )
      remaining = remaining.slice(boldIdx + boldMatch[0].length)
    } else if (italicMatch) {
      if (italicIdx > 0) parts.push(escapeHtml(remaining.slice(0, italicIdx)))
      parts.push(`<em class="italic">${escapeHtml(italicMatch[1])}</em>`)
      remaining = remaining.slice(italicIdx + italicMatch[0].length)
    }
  }

  return parts.join('')
}
