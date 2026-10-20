/**
 * SC-001 / NF-001 / NF-002 — tab pages against the frozen 0.4.0 export.
 *
 * The frozen fixtures in `tests/fixtures/export-baseline-0.4.0/` were captured
 * on the released 0.4.0 commit and are digest-pinned by the frozen-baseline
 * suite, which also owns the strict comparisons for every page that carries no
 * tab set. This suite owns the pages that DO render a tab set, and it compares
 * them under the permitted-difference rule: mask the tab-set sections, strip the
 * tab rules, and on a tabs-only page strip the script and no-script elements
 * 0.4.0 never emitted — everything else must match byte for byte.
 *
 * That reading of the permitted-difference clause is the one the filed amendment
 * records; the tests encode it, and the strip counts below are the tripwire that
 * it stays NARROW — a change anywhere else on the page turns this suite red.
 */
import { describe, it, expect } from 'vitest'
import { gzipSync } from 'node:zlib'
import {
  exportSitePages,
  findSite,
  fixtureHtml,
  render,
} from './helpers/export-baseline-0.4.0-inputs'
import {
  hasLegacyNoScriptRules,
  maskTabSections,
  noScriptText,
  reduceForComparison,
} from './helpers/tab-set-allowed-diff'
import {
  BEHAVIOR_RUNTIME_SOURCE,
  TABS_NOSCRIPT_CSS,
} from '../src/lib/export-behavior-runtime'
import type { BaselineSite } from './helpers/export-baseline-0.4.0-inputs'

/**
 * Reduce a FRESH tab page to the bytes it must keep, asserting the strip counts
 * that prove the rule is narrow. The frozen side is reduced identically — its
 * block anchors are masked too — but only the fresh side's counts are asserted:
 * it is the side that must show the expected population.
 */
function normalizeTabsOnly(fresh: string, blockIds: string[]): string {
  const reduced = reduceForComparison(fresh, blockIds, 'tabs-only')
  expect(reduced.counts.scripts, 'tabs-only page carries no script element').toBe(1)
  expect(reduced.counts.noscripts, 'tabs-only page carries no no-script element').toBe(1)
  expect(reduced.counts.tabRules, 'tab rules were not found').toBe(1)
  expect(reduced.counts.sections, 'the named tab-set section was not masked').toBe(blockIds.length)
  return reduced.html
}

function reduceTabsOnly(html: string, blockIds: string[]): string {
  return reduceForComparison(html, blockIds, 'tabs-only').html
}

/** A combo page keeps its 0.4.0 menu/faq rules; only the tab rules leave it. */
function normalizeCombo(fresh: string, blockIds: string[]): string {
  const reduced = reduceForComparison(fresh, blockIds, 'combo')
  expect(reduced.counts.scripts, 'combo page script text was not emptied').toBe(1)
  expect(reduced.counts.tabRules, 'tab rules were not found in the no-script block').toBe(1)
  expect(reduced.counts.sections, 'the named tab-set section was not masked').toBe(blockIds.length)
  return reduced.html
}

function reduceCombo(html: string, blockIds: string[]): string {
  return reduceForComparison(html, blockIds, 'combo').html
}

function maskedSite(slug: string, ids: string[]) {
  return { html: render(findSite(slug)), ids }
}

describe('SC-001 (a) — features-tabs-three', () => {
  const FRESH = maskedSite('features-tabs-three', ['f-1'])
  const GOLDEN = fixtureHtml('features-tabs-three.html')

  it('renders one tab list with three tabs and three panels', () => {
    expect(FRESH.html.match(/role="tablist"/g) ?? []).toHaveLength(1)
    expect(FRESH.html.match(/data-sb-tab /g) ?? []).toHaveLength(3)
    expect(FRESH.html.match(/role="tabpanel"/g) ?? []).toHaveLength(3)
  })

  it('selects the first tab and hides the other two panels', () => {
    const buttons = FRESH.html.match(/<button[^>]*>/g) ?? []
    expect(buttons[0]).toContain('aria-selected="true"')
    expect(buttons[0]).toContain('tabindex="0"')
    expect(buttons[1]).toContain('aria-selected="false"')
    expect(buttons[2]).toContain('aria-selected="false"')

    const panels = FRESH.html.match(/<div role="tabpanel"[^>]*>/g) ?? []
    expect(panels[0]).not.toContain(' hidden')
    expect(panels[1]).toContain(' hidden')
    expect(panels[2]).toContain(' hidden')
  })

  it('carries exactly one shared script element, with the current runtime source', () => {
    expect(FRESH.html.match(/<script data-sb-runtime>/g) ?? []).toHaveLength(1)
    expect(FRESH.html).toContain(BEHAVIOR_RUNTIME_SOURCE)
  })

  it('NF-001 — the emitted script is inside the gzip ceiling', () => {
    const size = gzipSync(Buffer.from(BEHAVIOR_RUNTIME_SOURCE, 'utf8')).length
    expect(size, 'NF-001 cumulative ceiling').toBeLessThanOrEqual(2048)
    expect(size, 'NF-001 hard cap').toBeLessThanOrEqual(5120)
  })

  it('NF-002 — the page matches the golden once the permitted differences are removed', () => {
    expect(normalizeTabsOnly(FRESH.html, FRESH.ids)).toBe(reduceTabsOnly(GOLDEN, ['f-1']))
  })
})

describe('SC-001 (a) — features-tabs-variants, one layout for every variant', () => {
  it('NF-002 — the page matches the golden with all three tab sections masked', () => {
    const entry = findSite('features-tabs-variants')
    const ids = ['f-grid', 'f-list', 'f-alt']
    expect(normalizeTabsOnly(render(entry), ids)).toBe(
      reduceTabsOnly(fixtureHtml('features-tabs-variants.html'), ids),
    )
  })

  it('renders three independent tab sets with distinct ids', () => {
    const html = render(findSite('features-tabs-variants'))
    expect(html.match(/role="tablist"/g) ?? []).toHaveLength(3)
    expect(html).toContain('id="sb_tabs_1_t1"')
    expect(html).toContain('id="sb_tabs_2_t1"')
    expect(html).toContain('id="sb_tabs_3_t1"')
  })
})

describe('SC-001 (a) — navbar-faq-tabs, a combo page', () => {
  const html = render(findSite('navbar-faq-tabs'))

  it('keeps the 0.4.0 menu and faq rules and appends the tab rules after them', () => {
    expect(html).toContain('[data-sb-menu-toggle]')
    expect(html).toContain('.faq-content')
    expect(html.indexOf('[data-sb-menu-toggle]')).toBeLessThan(html.indexOf(TABS_NOSCRIPT_CSS))
  })

  it('NF-002 — the page matches the golden with the tab section and tab rules removed', () => {
    expect(normalizeCombo(html, ['f-1'])).toBe(
      reduceCombo(fixtureHtml('navbar-faq-tabs.html'), ['f-1']),
    )
  })
})

describe('SC-001 (b)(c)(d) — the non-tab pages carry no shared script', () => {
  // Strict byte identity to the script-free goldens is owned by the
  // frozen-baseline suite; this is the explicit re-assertion, so a suite move
  // cannot leave the claim unasserted here.
  it.each(['features-no-display', 'features-tabs-one-item', 'features-hostile-display'])(
    '%s carries no runtime script and no tab list',
    (slug) => {
      const html = render(findSite(slug))
      expect(html).not.toContain('data-sb-runtime')
      expect(html).not.toContain('role="tablist"')
    },
  )

  it('two-page-tabs--2 carries no runtime script and no tab list', () => {
    const entry: BaselineSite = findSite('two-page-tabs')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)
    expect(pages[1].html).not.toContain('data-sb-runtime')
    expect(pages[1].html).not.toContain('role="tablist"')
  })
})

describe('SC-001 — a tabs-only page carries only the tab rules', () => {
  it('its no-script block has no menu or faq rule', () => {
    const html = render(findSite('features-tabs-three'))
    expect(hasLegacyNoScriptRules(html)).toBe(false)
    expect(noScriptText(html)).not.toContain('[data-sb-menu-toggle]')
    expect(noScriptText(html)).not.toContain('.faq-content')
    expect(html).toContain(TABS_NOSCRIPT_CSS)
  })

  it('its no-script content is exactly the tab rules, pinned as a literal', () => {
    // A literal, not `TABS_NOSCRIPT_CSS`: importing the constant would move with
    // the emitter and prove nothing about the page. The rule text is duplicated
    // here on purpose — this is the only page-level pin of the emitted bytes.
    const TAB_RULES =
      '[data-sb-tablist]{display:none!important}\n[data-sb-tab-panel],[data-sb-tab-title]{display:block!important}'
    expect(noScriptText(render(findSite('features-tabs-three')))).toBe(TAB_RULES)
  })

  it('the combo page still does, proving the conditional is a real branch', () => {
    expect(hasLegacyNoScriptRules(render(findSite('navbar-faq-tabs')))).toBe(true)
  })
})

describe('SC-001 — two-page site, only page 1 carries the script', () => {
  const entry: BaselineSite = findSite('two-page-tabs')
  const pages = exportSitePages(entry.config, entry.options ?? undefined)

  it('exports two pages', () => {
    expect(pages).toHaveLength(2)
  })

  it('page 1 renders the tab set and its masked form matches the golden', () => {
    expect(normalizeTabsOnly(pages[0].html, ['f-1'])).toBe(
      reduceTabsOnly(fixtureHtml('two-page-tabs--1.html'), ['f-1']),
    )
  })

  it('page 2 has no tab set and no script, and is strictly identical to its golden', () => {
    expect(pages[1].html).toBe(fixtureHtml('two-page-tabs--2.html'))
    expect(pages[1].html).not.toContain('data-sb-runtime')
    expect(pages[1].html).not.toContain('role="tablist"')
  })
})

describe('helper teeth — the permitted-difference rule stays narrow', () => {
  it('a byte outside the masked sections is a failure', () => {
    const entry = findSite('features-tabs-three')
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })

    expect(normalizeTabsOnly(mutated, ['f-1'])).not.toBe(
      reduceTabsOnly(fixtureHtml('features-tabs-three.html'), ['f-1']),
    )
  })

  it('a byte inside an unmasked section is a failure', () => {
    const entry = findSite('features-tabs-three')
    const mutated = render(entry).replace('Tabs hero', 'Tabs herox')
    expect(normalizeTabsOnly(mutated, ['f-1'])).not.toBe(
      reduceTabsOnly(fixtureHtml('features-tabs-three.html'), ['f-1']),
    )
  })

  it('a mask count mismatch is a failure, not a silently shorter document', () => {
    const html = render(findSite('features-tabs-three'))
    const masked = maskTabSections(html, ['f-missing'])

    // Nothing was masked, so the tab-set markup must survive whole. The only
    // change this call may make is the tab-rule strip, asserted separately — the
    // equality below isolates the mask count instead of comparing against a raw
    // render that still carries the rules.
    expect(masked.counts.sections).toBe(0)
    expect(masked.counts.tabRules).toBe(1)
    expect(masked.html).toBe(html.replace(TABS_NOSCRIPT_CSS, ''))
    expect(masked.html).toContain('<section id="f-1"')
    expect(masked.html).toContain('</body>')
  })

  it('a page that stopped rendering its tab set fails the wrapper strip count', () => {
    expect(() => normalizeTabsOnly(fixtureHtml('features-tabs-three.html'), ['f-1'])).toThrow()
  })

  it('masking a section cannot swallow the document when it is never closed', () => {
    const doc = '  <section id="f-1" class="x">\n<p>tail</p>\n'
    const masked = maskTabSections(doc, ['f-1'])

    expect(masked.counts.sections).toBe(0)
    expect(masked.html).toBe(doc)
  })
})
