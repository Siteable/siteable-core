/**
 * Allowed-difference normalizers for the tab set against the frozen 0.4.0 export.
 *
 * A page that renders a tab set differs from its frozen 0.4.0 snapshot in
 * exactly the ways the locked spec permits, and this module removes exactly
 * those — nothing else. Everything it strips is a literal emitted string or a
 * literal-bounded region, and every strip reports its count so a no-op cannot
 * pass a test that expects a populated page.
 *
 * The three permitted differences (NF-002, as widened by the filed
 * permitted-difference amendment):
 *   1. the tab-set markup of the affected block — masked by whole section;
 *   2. the tab rules inside the no-script style block;
 *   3. on a page that carries the shared script ONLY because of a tab set, the
 *      script element and the no-script style element themselves, which the
 *      0.4.0 export never emitted.
 *
 * A combo page (one that also has a navbar or faq) keeps its 0.4.0 no-script
 * block, so only the tab rules leave it; its script text is handled by the
 * frozen-baseline script-text rule, `stripRuntimeScriptText`.
 */
import {
  renderBehaviorNoscript,
  renderBehaviorScript,
  TABS_NOSCRIPT_CSS,
} from '../../src/lib/export-behavior-runtime'
import { stripRuntimeScriptText } from './behavior-runtime-allowed-diff'

export interface TabMaskCounts {
  sections: number
  tabRules: number
  scripts: number
  noscripts: number
}

/** The exact no-script element a tabs-ONLY page emits. */
const TABS_ONLY_NOSCRIPT = renderBehaviorNoscript([
  { type: 'features', props: { display: 'tabs', items: [{}, {}] } },
])

const NOSCRIPT_OPEN = '<noscript><style>'
const NOSCRIPT_CLOSE = '</style></noscript>'

function removeAll(html: string, literal: string): { html: string; count: number } {
  if (!literal) return { html, count: 0 }
  const parts = html.split(literal)
  return { html: parts.join(''), count: parts.length - 1 }
}

/**
 * Replace a block's whole section with a marker.
 *
 * Bounded by two literal markers rather than a regex over markup: the open
 * marker is the exact `<section id="…"` attribute run the exporter emits for a
 * block that has an id, and the region ends at the FIRST following `\n
 * </section>` — the exporter's own block terminator, at that exact indentation.
 *
 * LIMIT, stated because a probe found it: if a section's own terminator is
 * missing but a LATER sibling's is present, the region runs through that
 * sibling's terminator, so the sibling is masked too. That is over-masking, not
 * a silent pass — on a multi-section page the frozen side still carries the
 * sibling, so the comparison fails. A document with no terminator at all leaves
 * the remainder compared rather than truncated.
 */
function maskSection(html: string, blockId: string): { html: string; count: number } {
  const open = `<section id="${blockId}"`
  const CLOSE = '\n  </section>'

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
 * Mask the tab-set sections of a page and strip the tab rules.
 *
 * `blockIds` names the blocks that render as tab sets. Their count is asserted
 * by the caller, so a page that stopped rendering one of them — or a mask that
 * stopped matching — fails loudly instead of comparing a truncated document.
 */
export function maskTabSections(
  html: string,
  blockIds: string[],
): { html: string; counts: { sections: number; tabRules: number } } {
  let out = html
  let sections = 0

  for (const id of blockIds) {
    const masked = maskSection(out, id)
    out = masked.html
    sections += masked.count
  }

  // On a combo page the tab rules follow the menu/faq rules on their own line,
  // so removing the line keeps the 0.4.0 rules the golden still carries. The
  // bare literal is the second attempt for a document where the tab rules are
  // the whole style element's content. Counts add so a caller asserting "the
  // tab rules were found exactly once" cannot be satisfied by a partial match.
  const lines = removeAll(out, '\n' + TABS_NOSCRIPT_CSS)
  const rules = removeAll(lines.html, TABS_NOSCRIPT_CSS)

  return { html: rules.html, counts: { sections, tabRules: rules.count + lines.count } }
}

/**
 * Remove the script element and the whole no-script element a TABS-ONLY page
 * necessarily gains. Never call this on a combo page — its 0.4.0 snapshot
 * already carries the no-script element, and removing it here would hide a real
 * difference in the menu or faq rules.
 */
export function stripTabsOnlyWrappers(html: string): { html: string; counts: TabMaskCounts } {
  const script = removeAll(html, renderBehaviorScript())
  const noscript = removeAll(script.html, TABS_ONLY_NOSCRIPT)

  // On a tabs-only page the removed no-script element IS the tab rules, so the
  // rule count is carried by the wrapper strip rather than by `maskTabSections`.
  // It equals the number of exact tabs-only no-script literals removed, and is 0
  // when the wrapper never matched — so a no-op cannot pass the caller's count.
  const tabRules = noscript.count

  return {
    html: noscript.html,
    counts: { sections: 0, tabRules, scripts: script.count, noscripts: noscript.count },
  }
}

/**
 * The no-script element's text, or `''` when the document has none.
 *
 * Scoped to the ELEMENT on purpose: the runtime source names
 * `[data-sb-menu-toggle]` too, so a document-wide search would report the menu
 * rule present on every page that carries the shared script.
 */
export function noScriptText(html: string): string {
  const start = html.indexOf(NOSCRIPT_OPEN)
  if (start === -1) return ''
  const end = html.indexOf(NOSCRIPT_CLOSE, start)
  if (end === -1) return ''
  return html.slice(start + NOSCRIPT_OPEN.length, end)
}

/** True when the no-script block carries the menu rule 0.4.0 emitted. */
export function hasLegacyNoScriptRules(html: string): boolean {
  return noScriptText(html).includes('[data-sb-menu-toggle]')
}

/**
 * Reduce a document to the bytes NF-002 requires a tab page to keep.
 *
 * Applied to BOTH sides of every comparison: the fresh export carries the tab
 * markup, the rules and (tabs-only) the wrappers; the frozen 0.4.0 document
 * carries the default markup and none of the rest. Only the FRESH side is
 * asserted for strip counts — the frozen side legitimately strips nothing.
 */
export function reduceForComparison(
  html: string,
  blockIds: string[],
  mode: 'tabs-only' | 'combo',
): { html: string; counts: TabMaskCounts } {
  const scriptText = mode === 'combo' ? stripRuntimeScriptText(html) : { html, counts: { scripts: 0 } }
  const wrappers = mode === 'tabs-only' ? stripTabsOnlyWrappers(scriptText.html) : null
  const masked = maskTabSections(wrappers ? wrappers.html : scriptText.html, blockIds)

  return {
    html: masked.html,
    counts: {
      sections: masked.counts.sections,
      tabRules: masked.counts.tabRules + (wrappers ? wrappers.counts.tabRules : 0),
      scripts: (wrappers ? wrappers.counts.scripts : scriptText.counts.scripts),
      noscripts: wrappers ? wrappers.counts.noscripts : 0,
    },
  }
}
