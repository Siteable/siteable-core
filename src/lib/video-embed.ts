/**
 * YouTube / Vimeo id extraction, shared by the React `VideoBlock` and the
 * export renderer (phase 03, decision D2). Moved verbatim out of
 * `src/blocks/video/VideoBlock.tsx`; behavior is unchanged.
 *
 * The export renderer builds an iframe `src` ONLY from the id these functions
 * return — never from the raw stored URL — so a malformed or hostile `url` prop
 * can never reach the `src` attribute (SC-009).
 */
export function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/)
  return match?.[1] || null
}

export function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match?.[1] || null
}

/**
 * The iframe `src` the engine embeds for a `video` block, or `null` when the
 * url yields no id (the renderer then shows a placeholder). The single
 * variant decision point for the React `VideoBlock`, the export renderer, and
 * any consumer asking "will this url actually embed?" — `vimeo` selects the
 * Vimeo extractor, every other variant (including none) is YouTube.
 */
export function videoEmbedUrl(url: string, variant: string | undefined): string | null {
  if (variant === 'vimeo') {
    const id = extractVimeoId(url)
    return id ? `https://player.vimeo.com/video/${id}` : null
  }
  const id = extractYouTubeId(url)
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
}
