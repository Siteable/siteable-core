/**
 * Frozen export baseline — provenance and byte-identity tripwire.
 *
 * Provenance: every file in `tests/fixtures/export-baseline-0.4.0/` was produced
 * by calling `exportSiteToHTML` (or `exportSitePages`, for the multi-page site)
 * with the 0.4.0 exporter against the inputs in `sites.json` and the legacy
 * corpus JSONs, and writing each returned document to disk unmodified. The
 * capture ran on the released 0.4.0 commit with `src/` and `package.json`
 * byte-untouched (`git diff --quiet v0.4.0 -- src package.json`), before any
 * source edit. The capture script was a throwaway test file and is not committed.
 *
 * DO NOT regenerate these fixtures, and DO NOT hand-edit them. Re-derivation is
 * a review activity: check out the frozen commit in a scratch worktree, run the
 * exporter there, and diff the result against these files.
 *
 * `FROZEN_SHA256` below is what actually enforces that. A regenerated fixture
 * would make every byte-identity assertion in this file pass vacuously, so each
 * file's digest is pinned and any regeneration turns this suite red.
 *
 * Four comparison rules, per page:
 *   - STRICT — the fresh export equals the frozen file byte for byte. Used for
 *     every page that does not carry the behavior runtime.
 *   - SCRIPT-TEXT-TOLERANT — the runtime script element's TEXT is emptied on both
 *     sides, then compared. Needed because the frozen file holds the runtime
 *     source as it was emitted by 0.4.0; once that source changes there is no
 *     literal left to strip, so only the element's text is exempt. Every other
 *     byte, including the no-script block, stays compared. One page
 *     (`navbar-faq-carousel`) also renders a carousel, so its no-script block
 *     gains the carousel rules AND its affected block renders carousel markup;
 *     that page additionally masks the block and drops those rules, both counted.
 *     No other page widens this rule.
 *   - TAB-SET-TOLERANT — the tab-set sections are masked and the rules and
 *     wrappers the page gained are removed, then compared. Used for the pages
 *     that render an opted-in tab set: they gain a whole script element and a
 *     no-script element that the frozen document does not have, so the
 *     script-text rule above cannot close them (it strips nothing from the
 *     frozen side). Every other byte stays compared.
 *   - CAROUSEL-SET — named here only. Their digests are pinned, and their
 *     masked comparison lives in the carousel baseline suite; this file keeps
 *     the bookkeeping row so a fixture cannot drop out of every list.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  capturedFileNames,
  capturedFilesOnDisk,
  exportSitePages,
  findSite,
  fixtureHtml,
  readCorpus,
  render,
} from './helpers/export-baseline-0.4.0-inputs'
import { stripRuntimeScriptText } from './helpers/behavior-runtime-allowed-diff'
import { stripSeoExpecting } from './helpers/seo-head-allowed-diff'
import { reduceCarouselForComparison } from './helpers/carousel-allowed-diff'
import { reduceForComparison } from './helpers/tab-set-allowed-diff'

/** sha256 of every captured file. Any regeneration or hand-edit fails here. */
const FROZEN_SHA256: Record<string, string> = {
  'carousel-gallery.html': '319cd3a0905c86c9b95ab5b8f2a3fe85753aab167e88d2218d6afaa79842f4b7',
  'carousel-testimonials.html': '3d0f07c0e449a0ca4702488781fdc672a23206ce25901a0af9f931d454e28521',
  'carousel-variants.html': 'faa532acc73df62b4f55e108ce34047fa9a3aceae8e923c8ee4a3e851a166dfd',
  'carousels-hostile-display.html': '440d85d1ca93386c4388dd72f2ca255532a0e6426c05600d4aa529ff12be685d',
  'carousels-one-item.html': '0fc37c490f75f11257aa840439b253cf385b3378ae3fe4ebb4c5f9b3a9e7530c',
  'corpus-01.html': '567af7f51787d4dc9f62862a32732966e2015757a635832cc0ba37ac2389e362',
  'corpus-02.html': 'fc6077cbe7eac5087dec3fa8b71c61c98c85ef6b7c6b915b6047d970b297c0e2',
  'corpus-03.html': '3d227332c6c375fbd6d349800ac2d4920af6956c00a566aa85f7316aa5e43fae',
  'corpus-04.html': '7b093b7897fadc0831fb00a145a3d9242a4f48a8b5c643c2aca20e3f93f6c75f',
  'corpus-05.html': 'e6feddd8c632599423a68048fcd25fcbb2ce755c48a7807fdcf453b6892c6385',
  'corpus-06.html': '9dd5ce135a1c948691d9d4fac2ddba4a7d0cc1a9149dd595ae9bb84f5702037b',
  'features-hostile-display.html': 'a917c91752601bdf1ddd0c4dc67e5b18f6b83ed336ef225eac3ece25bd30e127',
  'features-no-display.html': '3d7e86602ed856bb477d5e0a1ef924c15f539cef01f0ed077c49dce4437a98e5',
  'features-tabs-one-item.html': '20209dd6af8be6555e9e010c3084d228ea8dc6cb3382388653df7f9f418fed6c',
  'features-tabs-three.html': '0b47e2921eb8b147cc99526f368b7c64564e0be719ba8b058b843616c7f71b32',
  'features-tabs-variants.html': '0cc165108aa8c3458acee491d6aa9c13478d7f8bd978d06b40845ee3f822908e',
  'gallery-no-display.html': '9e35bfb82dd257d5a2a73992376c6132fd85aa378ace0ba8563dd5769fb2fd44',
  'navbar-faq-carousel.html': '1f7dda698ade52a4b6e7ac6a7d10498600d210dfc96f21ff384a33ca64b5dce1',
  'navbar-faq-no-tabs.html': 'a5b8e3ee432d647255df0482bb570e266436d5156b7e5fe0a2ad988bfc1f8638',
  'navbar-faq-tabs.html': 'a91d5eb20bab1bdf15d460e0291642d0d4f89a15374fe94c0251ac4665a33f3e',
  'testimonials-no-display.html': '887d86090fa3a8f60be7a4beeb59b5ab5519c06834ab834413c40b0cf2012f6d',
  'two-page-carousel--1.html': '3d0f07c0e449a0ca4702488781fdc672a23206ce25901a0af9f931d454e28521',
  'two-page-carousel--2.html': '947e80cb25cc2286384d224fb7b6f833f97ae25990e76cd2313ab90ad1c38b5b',
  'two-page-tabs--1.html': 'd16d598fdf2c9467dc1e050a00121bc389847d101d6578a36e7ebc130b28c9a0',
  'two-page-tabs--2.html': '020f91babfc3162307ad459dccf8b7c9d4bde26d3be5c35181b1c54cc839fc46',
}

describe('frozen 0.4.0 fixtures are pinned', () => {
  it.each(Object.keys(FROZEN_SHA256).sort())('%s matches its recorded digest', (file) => {
    const actual = createHash('sha256').update(fixtureHtml(file), 'utf8').digest('hex')
    expect(actual).toBe(FROZEN_SHA256[file])
  })

  it('pins every captured file, so a new fixture cannot be added unpinned', () => {
    expect(new Set(capturedFileNames())).toEqual(new Set(Object.keys(FROZEN_SHA256)))
  })

  it('has no orphan fixture on disk', () => {
    // A stray .html in neither the inputs nor the pin table would otherwise be
    // compared by nothing and asserted by nothing.
    expect(new Set(capturedFilesOnDisk())).toEqual(new Set(Object.keys(FROZEN_SHA256)))
  })
})

/** Strict set: pages that do not carry the behavior runtime. */
const STRICT_CORPUS = ['corpus-02', 'corpus-03', 'corpus-04', 'corpus-06']
const STRICT_SITES = [
  'features-no-display',
  'features-tabs-one-item',
  'features-hostile-display',
  'testimonials-no-display',
  'gallery-no-display',
  'carousels-one-item',
  'carousels-hostile-display',
]
/** Tolerant set: pages carrying the runtime script element. */
const TOLERANT_CORPUS = ['corpus-01', 'corpus-05']
const TOLERANT_SITES = ['navbar-faq-no-tabs']
/** The one tolerant page that also renders a carousel and so gains its rules. */
const CAROUSEL_TOLERANT_SITE = 'navbar-faq-carousel'
/**
 * Tab-set set: pages that render an opted-in tab set. Their tab-set blocks are
 * masked by block id, so the ids are the fixture inputs, not arbitrary names.
 */
const TAB_SET_SITES = [
  { slug: 'features-tabs-three', ids: ['f-1'] },
  { slug: 'features-tabs-variants', ids: ['f-grid', 'f-list', 'f-alt'] },
]
/**
 * Carousel set: named here for bookkeeping. Their masked comparison is owned by
 * the carousel baseline suite, which is the suite that renders them fresh.
 */
const CAROUSEL_SET_SITES = ['carousel-testimonials', 'carousel-gallery', 'carousel-variants']

/**
 * Every pinned fixture must be NAMED by a comparison rule somewhere. The pin
 * table proves a file exists and is unmodified; this proves the lists did not
 * silently lose a row. It is bookkeeping, not enforcement: the fixtures marked
 * delegated are compared by the tab-set suite, and deleting those comparisons
 * would not fail this file.
 */
describe('every pinned fixture is named by a comparison rule', () => {
  it('the lists name every fixture, including the delegated ones', () => {
    const named = [
      ...STRICT_CORPUS.map((slug) => `${slug}.html`),
      ...STRICT_SITES.map((slug) => `${slug}.html`),
      ...TOLERANT_CORPUS.map((slug) => `${slug}.html`),
      ...TOLERANT_SITES.map((slug) => `${slug}.html`),
      `${CAROUSEL_TOLERANT_SITE}.html`,
      ...TAB_SET_SITES.map(({ slug }) => `${slug}.html`),
      // Pinned here; compared by the carousel baseline suite.
      ...CAROUSEL_SET_SITES.map((slug) => `${slug}.html`),
      'two-page-carousel--1.html',
      // Delegated to the tab-set suite.
      'two-page-tabs--1.html',
      'navbar-faq-tabs.html',
      // Strict, in this file.
      'two-page-tabs--2.html',
      'two-page-carousel--2.html',
    ]

    expect(named.sort()).toEqual(Object.keys(FROZEN_SHA256).sort())
  })
})

function renderCorpus(file: string): string {
  const entry = readCorpus().find((candidate) => candidate.slug === file)
  if (!entry) throw new Error(`no corpus entry named "${file}"`)
  return render(entry)
}

describe('byte identity against the frozen 0.4.0 export (strict)', () => {
  it.each(STRICT_CORPUS)('%s.html is byte-identical', (file) => {
    expect(stripSeoExpecting(renderCorpus(file))).toBe(fixtureHtml(`${file}.html`))
  })

  it.each(STRICT_SITES)('%s is byte-identical', (slug) => {
    expect(stripSeoExpecting(render(findSite(slug)))).toBe(fixtureHtml(`${slug}.html`))
  })

  it('two-page-tabs--2.html is byte-identical', () => {
    // The plain page of the multi-page site: it carries no tab set, so it stays
    // under the strict rule permanently.
    const entry = findSite('two-page-tabs')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)
    expect(pages).toHaveLength(2)
    expect(stripSeoExpecting(pages[1].html)).toBe(fixtureHtml('two-page-tabs--2.html'))
  })

  it('two-page-carousel--2.html is byte-identical', () => {
    // The plain page of the carousel site: no carousel, so strict forever.
    const entry = findSite('two-page-carousel')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)
    expect(pages).toHaveLength(2)
    expect(stripSeoExpecting(pages[1].html)).toBe(fixtureHtml('two-page-carousel--2.html'))
  })

  it.each(['testimonials-no-display', 'gallery-no-display', 'carousels-one-item', 'carousels-hostile-display'])(
    '%s carries no runtime script',
    (slug) => {
      // Implied by byte identity; named so the guarantee is asserted, not inferred.
      expect(render(findSite(slug))).not.toContain('data-sb-runtime')
    },
  )

  it('a changed input is a failure, not a near match', () => {
    const entry = findSite('features-no-display')
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })
    expect(mutated).not.toBe(fixtureHtml('features-no-display.html'))
  })
})

describe('byte identity against the frozen 0.4.0 export (script-text-tolerant)', () => {
  function expectTolerantMatch(renderFresh: () => string, file: string) {
    // corpus-05 carries an image, so it also emits the two image Twitter tags.
    const twitter = file === 'corpus-05.html' ? 4 : 2
    const fresh = stripRuntimeScriptText(stripSeoExpecting(renderFresh(), { twitter }))
    const frozen = stripRuntimeScriptText(fixtureHtml(file))

    expect(fresh.html).toBe(frozen.html)
    expect(fresh.counts.scripts).toBe(1)
    expect(frozen.counts.scripts).toBe(1)
  }

  it.each(TOLERANT_CORPUS)('%s.html matches once the script element text is emptied', (file) => {
    expectTolerantMatch(() => renderCorpus(file), `${file}.html`)
  })

  it.each(TOLERANT_SITES)('%s matches once the script element text is emptied', (slug) => {
    expectTolerantMatch(() => render(findSite(slug)), `${slug}.html`)
  })

  it('a byte outside the script element is a failure', () => {
    const entry = findSite('navbar-faq-no-tabs')
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })

    expect(stripRuntimeScriptText(render(entry)).html).not.toBe(
      stripRuntimeScriptText(mutated).html,
    )
  })

  it('a byte inside the no-script block is a failure', () => {
    const frozen = fixtureHtml('navbar-faq-no-tabs.html')
    const mutated = frozen.replace('<noscript>', '<noscript> ')
    expect(stripRuntimeScriptText(frozen).html).not.toBe(
      stripRuntimeScriptText(mutated).html,
    )
  })
})

describe('byte identity against the frozen 0.4.0 export (script-text- and carousel-tolerant)', () => {
  /**
   * This page carries the shared script AND renders a carousel, so it differs
   * from its frozen snapshot in exactly three permitted ways: the script
   * element's text, the carousel rules in the no-script block, and the carousel
   * markup of the affected block. The block is masked on BOTH sides — its
   * default-layout section carries the same anchor — and only the FRESH side's
   * strip counts are asserted: the frozen document legitimately strips no rules.
   * A rule that stopped being emitted would drop the count to 0 and fail here.
   */
  const reduce = (html: string) =>
    reduceCarouselForComparison(html, ['t-1'], 'combo')

  it('matches once the script text is emptied, the carousel masked and its rules removed', () => {
    const fresh = reduce(stripSeoExpecting(render(findSite(CAROUSEL_TOLERANT_SITE))))
    const frozen = reduce(fixtureHtml(`${CAROUSEL_TOLERANT_SITE}.html`))

    expect(fresh.counts.scripts, 'runtime script element').toBe(1)
    expect(frozen.counts.scripts, 'frozen script element').toBe(1)
    expect(fresh.counts.carouselRules, 'carousel rules').toBe(1)
    expect(frozen.counts.carouselRules, 'frozen carousel rules').toBe(0)
    expect(fresh.counts.sections, 'carousel region').toBe(1)
    expect(frozen.counts.sections, 'frozen carousel region').toBe(1)
    expect(fresh.html).toBe(frozen.html)
  })

  it('a byte outside the script element and the carousel region is a failure', () => {
    const entry = findSite(CAROUSEL_TOLERANT_SITE)
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })

    expect(reduce(render(entry)).html).not.toBe(reduce(mutated).html)
  })
})

describe('byte identity against the frozen 0.4.0 export (tab-set-tolerant)', () => {
  /**
   * Reduce a FRESH tab page to the bytes it must keep and assert the strip
   * counts that keep the rule narrow. The frozen side is reduced identically —
   * its block anchors are masked too — but only the fresh side's counts are
   * asserted: it is the side that must show the expected population.
   */
  function expectTabSetMatch(fresh: string, file: string, ids: string[]) {
    const reduced = reduceForComparison(stripSeoExpecting(fresh), ids, 'tabs-only')
    const frozen = reduceForComparison(fixtureHtml(file), ids, 'tabs-only')

    expect(reduced.counts.scripts, `${file}: runtime script element`).toBe(1)
    expect(reduced.counts.noscripts, `${file}: no-script element`).toBe(1)
    expect(reduced.counts.tabRules, `${file}: tab rules`).toBe(1)
    expect(reduced.counts.sections, `${file}: masked tab-set sections`).toBe(ids.length)
    // The frozen side is masked by the same ids: its default-layout sections
    // carry the same block anchors, so a mask that stopped anchoring there would
    // otherwise be caught only incidentally by the fresh-side count.
    expect(frozen.counts.sections, `${file}: frozen tab-set sections`).toBe(ids.length)
    expect(frozen.counts.scripts, `${file}: frozen script element`).toBe(0)
    expect(reduced.html).toBe(frozen.html)
  }

  it.each(TAB_SET_SITES)(
    '$slug matches once its tab sets are masked and the rules removed',
    ({ slug, ids }) => {
      expectTabSetMatch(render(findSite(slug)), `${slug}.html`, ids)
    },
  )

  it('two-page-tabs--1.html matches, and page 2 stays under the strict rule', () => {
    const entry = findSite('two-page-tabs')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)

    expect(pages).toHaveLength(2)
    expectTabSetMatch(pages[0].html, 'two-page-tabs--1.html', ['f-1'])
    // The script lives on page 1 only: page 2 is the plain page.
    expect(pages[1].html).not.toContain('data-sb-runtime')
  })

  it('a byte outside the masked tab section is a failure', () => {
    const entry = findSite('features-tabs-three')
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })

    expect(reduceForComparison(mutated, ['f-1'], 'tabs-only').html).not.toBe(
      reduceForComparison(fixtureHtml('features-tabs-three.html'), ['f-1'], 'tabs-only').html,
    )
  })

  it('a page with no tab-set wrappers fails the counts', () => {
    // The frozen 0.4.0 document has no script and no no-script element, so the
    // count assertions reject it. This is a guard TEETH case for the counts, not
    // a dispatch-revert detector: a dispatch revert still emits the script and
    // the tab rules (both predicates are independent of the dispatcher), and the
    // default-layout section still carries the block anchor, so the masked
    // comparison would pass. The markup suite owns the dispatch-revert case.
    expect(() =>
      expectTabSetMatch(fixtureHtml('features-tabs-three.html'), 'frozen.html', ['f-1']),
    ).toThrow()
  })
})
