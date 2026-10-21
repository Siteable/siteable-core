/**
 * Allowed-difference normalizers for carousel pages against the frozen export.
 *
 * A page that renders a carousel differs from its frozen snapshot in exactly
 * the ways the locked contract permits, and this module removes exactly those
 * — nothing else. Everything it strips is a literal emitted string or a
 * literal-bounded region, and every strip reports its count so a no-op cannot
 * pass a test that expects a populated page.
 *
 * The permitted differences:
 *   1. the carousel markup of the affected block — masked by whole region;
 *   2. the carousel rules inside the no-script style block;
 *   3. on a page that carries the shared script ONLY because of a carousel, the
 *      script element and the no-script style element themselves.
 *
 * A combo page (one that also has a navbar or faq) keeps its frozen no-script
 * block, so only the carousel rules leave it; its script text is handled by the
 * frozen-baseline script-text rule.
 */
import {
  renderBehaviorNoscript,
  renderBehaviorScript,
} from '../../src/lib/export-behavior-runtime'
import { stripCarouselRules, stripRuntimeScriptText } from './behavior-runtime-allowed-diff'
import { maskSection } from './tab-set-allowed-diff'

export interface CarouselCounts {
  sections: number
  carouselRules: number
  scripts: number
  noscripts: number
}

/** The exact no-script element a carousel-ONLY page emits. */
const CAROUSEL_ONLY_NOSCRIPT = renderBehaviorNoscript([
  { type: 'testimonials', props: { display: 'carousel', items: [{}, {}] } },
])

function removeAll(html: string, literal: string): { html: string; count: number } {
  if (!literal) return { html, count: 0 }
  const parts = html.split(literal)
  return { html: parts.join(''), count: parts.length - 1 }
}

/**
 * Mask a block whose FROZEN layout rooted at a `<div id="…">`.
 *
 * The carousel path roots at a `<section>` for both block types, so the frozen
 * side of a gallery page (whose default layout is a `<div>` root) is not
 * covered by the shipped section mask. This second form is bounded the same
 * way: the exact open attribute run and the first following `\n    </div>`,
 * which is the default gallery renderer's own root terminator at that
 * indentation. It is used by the carousel comparison only; the shipped tab
 * mask keeps its single form.
 *
 * LIMIT, same shape as the section mask: a missing terminator leaves the
 * remainder compared rather than truncating it.
 */
function maskDivRoot(html: string, blockId: string): { html: string; count: number } {
  const open = `<div id="${blockId}"`
  const CLOSE = '\n    </div>'

  let out = ''
  let rest = html
  let count = 0

  for (;;) {
    const start = rest.indexOf(open)
    if (start === -1) break
    const end = rest.indexOf(CLOSE, start)
    if (end === -1) break

    out += rest.slice(0, start) + `<!--block:${blockId}-->`
    rest = rest.slice(end + CLOSE.length)
    count += 1
  }

  return { html: out + rest, count }
}

/**
 * Mask the carousel regions of a page and strip the carousel rules.
 *
 * `blockIds` names the blocks that render as carousels. Their count is asserted
 * by the caller, so a page that stopped rendering one of them — or a mask that
 * stopped matching — fails loudly instead of comparing a truncated document.
 */
export function maskCarouselSections(
  html: string,
  blockIds: string[],
): { html: string; counts: { sections: number; carouselRules: number } } {
  let out = html
  let sections = 0

  for (const id of blockIds) {
    // Fresh side: the carousel `<section>` root (and the default testimonials
    // root, which is also a `<section>`). Frozen gallery side: the `<div>` root.
    const sectionMasked = maskSection(out, id)
    const divMasked = maskDivRoot(sectionMasked.html, id)
    out = divMasked.html
    sections += sectionMasked.count + divMasked.count
  }

  // On a combo page the carousel rules follow the menu/faq rules on their own
  // line, so removing the line keeps the frozen rules the golden still carries.
  // The shared rule strip also tries the bare literal, for a document where the
  // carousel rules are the whole style element's content, and sums both counts
  // so a caller asserting "found exactly once" cannot be satisfied by a partial
  // match.
  const rules = stripCarouselRules(out)

  return {
    html: rules.html,
    counts: { sections, carouselRules: rules.counts.carouselRules },
  }
}

/**
 * Remove the script element and the whole no-script element a carousel-ONLY
 * page necessarily gains. Never call this on a combo page — its frozen
 * snapshot already carries the no-script element, and removing it here would
 * hide a real difference in the menu or faq rules.
 */
export function stripCarouselOnlyWrappers(html: string): {
  html: string
  counts: CarouselCounts
} {
  const script = removeAll(html, renderBehaviorScript())
  const noscript = removeAll(script.html, CAROUSEL_ONLY_NOSCRIPT)

  // On a carousel-only page the removed no-script element IS the carousel
  // rules, so the rule count is carried by the wrapper strip rather than by
  // `maskCarouselSections`. It is 0 when the wrapper never matched — so a
  // no-op cannot pass the caller's count.
  return {
    html: noscript.html,
    counts: {
      sections: 0,
      carouselRules: noscript.count,
      scripts: script.count,
      noscripts: noscript.count,
    },
  }
}

/**
 * Reduce a document to the bytes the permitted-difference rule requires a
 * carousel page to keep.
 *
 * Applied to BOTH sides of every comparison: the fresh export carries the
 * carousel markup, the rules and (carousel-only) the wrappers; the frozen
 * document carries the default markup and none of the rest. Only the FRESH side
 * is asserted for strip counts — the frozen side legitimately strips nothing
 * except its own masked block.
 */
export function reduceCarouselForComparison(
  html: string,
  blockIds: string[],
  mode: 'carousel-only' | 'combo',
): { html: string; counts: CarouselCounts } {
  const scriptText =
    mode === 'combo' ? stripRuntimeScriptText(html) : { html, counts: { scripts: 0 } }
  const wrappers = mode === 'carousel-only' ? stripCarouselOnlyWrappers(scriptText.html) : null
  const masked = maskCarouselSections(wrappers ? wrappers.html : scriptText.html, blockIds)

  return {
    html: masked.html,
    counts: {
      sections: masked.counts.sections,
      carouselRules: masked.counts.carouselRules + (wrappers ? wrappers.counts.carouselRules : 0),
      scripts: wrappers ? wrappers.counts.scripts : scriptText.counts.scripts,
      noscripts: wrappers ? wrappers.counts.noscripts : 0,
    },
  }
}
