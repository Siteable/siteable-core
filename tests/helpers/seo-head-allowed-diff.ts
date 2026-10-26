/**
 * Allowed-difference normalizer for exported pages against frozen output.
 *
 * Exported documents now carry head and image additions that the frozen
 * snapshots predate. This module removes exactly that permitted set and
 * nothing else; every strip is bounded by literal emitted text and reports a
 * count, so a no-op cannot pass a test that expects a populated page and any
 * other difference still shows up in the byte comparison.
 *
 * The permitted set:
 *   1. Twitter card meta tags;
 *   2. the single `application/ld+json` script;
 *   3. `decoding` / `loading` / `fetchpriority` attributes on `<img>` tags;
 *   4. the non-blocking font link pair (preload + noscript), rewritten back to
 *      the single render-blocking stylesheet link it replaced;
 *   5. a precompiled `<style data-export-css>` element (absent today; the
 *      strip tolerates absence).
 *
 * The canonical link is NOT in the set (it only appears when a site URL is
 * given). `outOfSet` lists anything of that kind left in the document so a
 * strict caller can fail on it.
 */
export interface SeoHeadCounts {
  twitter: number
  jsonLd: number
  imgAttrs: number
  fontLinks: number
  cssStyle: number
}

export interface SeoHeadResult {
  html: string
  counts: SeoHeadCounts
  /** Additions the normalizer deliberately does not strip (e.g. canonical). */
  outOfSet: string[]
}

const TWITTER_META_RE = /^[ \t]*<meta name="twitter:[a-z:_]+" content="[^"]*" \/>\n/gm
const JSON_LD_RE = /^[ \t]*<script type="application\/ld\+json">[\s\S]*?<\/script>\n/gm
const FONT_PAIR_RE =
  /([ \t]*)<link rel="preload" as="style" href="([^"]*)" onload="this\.onload=null;this\.rel='stylesheet'" \/>\n[ \t]*<noscript><link rel="stylesheet" href="\2" \/><\/noscript>/g
const CSS_STYLE_RE = /^[ \t]*<style data-export-css>[\s\S]*?<\/style>\n/gm
const IMG_TAG_RE = /<img\b[^>]*>/g
const IMG_ATTR_RE = / (?:decoding="async"|loading="lazy"|fetchpriority="high")/g

export function stripSeoHeadAdditions(input: string): SeoHeadResult {
  const counts: SeoHeadCounts = { twitter: 0, jsonLd: 0, imgAttrs: 0, fontLinks: 0, cssStyle: 0 }
  let html = input

  html = html.replace(TWITTER_META_RE, () => {
    counts.twitter += 1
    return ''
  })
  html = html.replace(JSON_LD_RE, () => {
    counts.jsonLd += 1
    return ''
  })
  html = html.replace(CSS_STYLE_RE, () => {
    counts.cssStyle += 1
    return ''
  })
  html = html.replace(FONT_PAIR_RE, (_all, indent: string, href: string) => {
    counts.fontLinks += 1
    return `${indent}<link rel="stylesheet" href="${href}" />`
  })
  html = html.replace(IMG_TAG_RE, (tag) =>
    tag.replace(IMG_ATTR_RE, () => {
      counts.imgAttrs += 1
      return ''
    }),
  )

  const outOfSet: string[] = []
  if (/<link rel="canonical"/.test(html)) outOfSet.push('canonical')
  return { html, counts, outOfSet }
}

/** Shorthand for call sites that only need the normalized document. */
export const stripSeo = (html: string): string => stripSeoHeadAdditions(html).html
