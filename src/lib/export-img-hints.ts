/**
 * Loading-hint attributes for every exported `<img>`.
 *
 * Fixed attribute order (decoding, loading, fetchpriority) keeps the output
 * deterministic. The literals are static: no user data flows through here.
 *
 * - `logo`: the navbar logo, above the fold but not the main image.
 * - `priority`: the first hero image on a page (likely the largest paint).
 * - `lazy`: every other image.
 */
export type ImgHintKind = 'logo' | 'priority' | 'lazy'

export function imgHintAttrs(kind: ImgHintKind): string {
  switch (kind) {
    case 'logo':
      return ' decoding="async"'
    case 'priority':
      return ' decoding="async" fetchpriority="high"'
    default:
      return ' decoding="async" loading="lazy"'
  }
}
