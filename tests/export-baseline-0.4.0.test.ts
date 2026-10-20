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
 * Two comparison rules, per page:
 *   - STRICT — the fresh export equals the frozen file byte for byte. Used for
 *     every page that does not carry the behavior runtime.
 *   - SCRIPT-TEXT-TOLERANT — the runtime script element's TEXT is emptied on both
 *     sides, then compared. Needed because the frozen file holds the runtime
 *     source as it was emitted by 0.4.0; once that source changes there is no
 *     literal left to strip, so only the element's text is exempt. Every other
 *     byte, including the no-script block, stays compared.
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

/** sha256 of every captured file. Any regeneration or hand-edit fails here. */
const FROZEN_SHA256: Record<string, string> = {
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
  'navbar-faq-no-tabs.html': 'a5b8e3ee432d647255df0482bb570e266436d5156b7e5fe0a2ad988bfc1f8638',
  'navbar-faq-tabs.html': 'a91d5eb20bab1bdf15d460e0291642d0d4f89a15374fe94c0251ac4665a33f3e',
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
  'features-tabs-three',
  'features-tabs-variants',
]
/** Tolerant set: pages carrying the runtime script element. */
const TOLERANT_CORPUS = ['corpus-01', 'corpus-05']
const TOLERANT_SITES = ['navbar-faq-no-tabs']

function renderCorpus(file: string): string {
  const entry = readCorpus().find((candidate) => candidate.slug === file)
  if (!entry) throw new Error(`no corpus entry named "${file}"`)
  return render(entry)
}

describe('byte identity against the frozen 0.4.0 export (strict)', () => {
  it.each(STRICT_CORPUS)('%s.html is byte-identical', (file) => {
    expect(renderCorpus(file)).toBe(fixtureHtml(`${file}.html`))
  })

  it.each(STRICT_SITES)('%s is byte-identical', (slug) => {
    expect(render(findSite(slug))).toBe(fixtureHtml(`${slug}.html`))
  })

  it.each([
    ['two-page-tabs--1.html', 0],
    ['two-page-tabs--2.html', 1],
  ])('%s is byte-identical', (file, index) => {
    const entry = findSite('two-page-tabs')
    const pages = exportSitePages(entry.config, entry.options ?? undefined)
    expect(pages).toHaveLength(2)
    expect(pages[index as number].html).toBe(fixtureHtml(file as string))
  })

  it('a changed input is a failure, not a near match', () => {
    const entry = findSite('features-no-display')
    const mutated = render({ ...entry, config: { ...entry.config, name: 'Other' } })
    expect(mutated).not.toBe(fixtureHtml('features-no-display.html'))
  })
})

describe('byte identity against the frozen 0.4.0 export (script-text-tolerant)', () => {
  function expectTolerantMatch(renderFresh: () => string, file: string) {
    const fresh = stripRuntimeScriptText(renderFresh())
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
