/**
 * FR-001 — multi-page export.
 *
 * One document per page, in page order, keyed by the normalized path (FR-002).
 * The document body comes from that page's blocks; everything else in the
 * document (theme, fonts, settings, title, OG, analytics) is site-level and is
 * therefore shared across pages — per-page SEO is explicitly out of scope.
 *
 * This module deliberately imports only `export-html.ts` and `page-path.ts`,
 * so a worker can pull it without dragging React in (NF-005).
 */
import type { BlockConfig, SiteConfig } from '@/blocks/types'
import { normalizePagePaths } from './page-path'
import { renderDocument, type ExportSiteOptions } from './export-html'

/** One rendered page: its published path and its complete HTML document. */
export interface PageDocument {
  path: string
  html: string
}

/**
 * Render every page of `config`.
 *
 * A non-empty page list is authoritative — top-level `blocks` is ignored
 * entirely. An absent or empty list means a pre-`pages[]` config, which yields
 * exactly one document at `/` from those top-level blocks (the same document
 * `exportSiteToHTML` returns).
 *
 * The normalizer is applied to the whole page list at once, never per page: it
 * resolves uniqueness and home placement across the list, so normalizing page
 * by page would hand out duplicate paths.
 */
export function exportSitePages(
  config: SiteConfig,
  options?: ExportSiteOptions,
): PageDocument[] {
  const pages: unknown = config.pages
  // `Array.isArray`, not `!pages || !pages.length`: a string, a number and
  // `{length: 2}` all pass the length test and then die in `.map`. A non-array
  // `pages` is treated as absent, which is exactly what `exportSiteToHTML`'s
  // `homeBlocks` does, so the two entry points agree on page 1.
  if (!Array.isArray(pages) || pages.length === 0) {
    return [{ path: '/', html: renderDocument(config, config.blocks, options) }]
  }

  const list = pages as Array<{ path?: string; blocks?: BlockConfig[] } | null | undefined>
  // `page?.path` / `page?.blocks`: a `null` entry costs that page its body and
  // lets the normalizer pick its path, rather than aborting the whole publish.
  // `Array.from`, not `.map`: `.map` SKIPS holes, so a sparse `pages` would
  // return a sparse result whose `docs[0]` is `undefined`. `Array.from` reads a
  // hole as `undefined`, which the `?.` guards then treat like a `null` page.
  const paths = normalizePagePaths(Array.from(list, (page) => page?.path as string))
  return Array.from(list, (page, index) => ({
    path: paths[index],
    // `?? []` because this is a public entry point over JSON-parsed config, and
    // one malformed page should cost that page its body, not abort a whole
    // publish with a TypeError from inside the renderer. `validateSiteConfig`
    // always materializes an array, so this is a boundary guard, not a
    // normalizer — same reasoning as `raw ?? ''` in `page-path.ts`.
    html: renderDocument(config, page?.blocks ?? [], options),
  }))
}
