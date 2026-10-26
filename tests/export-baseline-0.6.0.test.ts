/**
 * Frozen export baseline — provenance and byte-identity tripwire.
 *
 * Provenance: every file here was written by `exportSiteToHTML` (or
 * `exportSitePages` for the multi-page entry) on the released 0.6.0 commit, with
 * `src/` and `package.json` byte-untouched — verified with
 * `git diff --quiet v0.6.0 -- src package.json` before the first source edit.
 * `runtime-segments.json` is `BEHAVIOR_RUNTIME_SOURCE.split('\n')` as
 * `JSON.stringify(lines, null, 2) + '\n'`. The capture script was a throwaway
 * test and is not committed.
 *
 * DO NOT regenerate or hand-edit these files: `FROZEN_SHA256` is what enforces
 * that, since a regenerated fixture would make every byte-identity assertion
 * pass vacuously. Re-derivation is a review activity, not a test run.
 *
 * STRICT pages are compared byte for byte. SCRIPT-TEXT pages have the runtime
 * script element's text emptied on both sides — the frozen text is 0.6.0's, so
 * once that source changes there is no literal left to strip — while every
 * other byte is compared, including the no-script rules, which are named.
 *
 * The multi-page entry captures page 2 only: page 1 holds a block type 0.6.0
 * does not know (see the note in sites.json), and page 2 must stay identical
 * for ever because nothing on it can be affected.
 *
 * The runtime change this fixture permits is ONE contiguous run of new lines
 * before the closing line — see `checkRuntimeSegments`. A handler that has to
 * sit in two places of the source therefore fails here by design.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripSeoExpecting } from './helpers/seo-head-allowed-diff'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import { BEHAVIOR_RUNTIME_SOURCE } from '../src/lib/export-behavior-runtime'
import { stripRuntimeScriptText } from './helpers/behavior-runtime-allowed-diff'
import { checkRuntimeSegments } from './helpers/runtime-segment-subsequence'
import type { SiteConfig } from '../src/blocks/types'

// Local loader, not the 0.4.0 inputs helper: that helper's BASELINE_DIR is
// 0.4.0-bound, and only the site shape is shared between the two fixtures.
const DIR = resolve(import.meta.dirname, 'fixtures/export-baseline-0.6.0')
const LAST_SEGMENT = '})(document,window);'
const RUNTIME_SHA256_0_6_0 = 'ddee81c6c1c815b63d149892abd066416e66ffff12e7fc3c0e873a37ed08a156' // whole 0.6.0 source
type Entry = { slug: string; config: SiteConfig; multipage?: boolean; options?: { settings?: Record<string, string> } | null }

/** sha256 of every captured artifact. Any regeneration or hand-edit fails here. */
const FROZEN_SHA256: Record<string, string> = {
  'hero-only.html': '1e79276472b55f2d511415ad6c81a6a0463ba3aeb1ac86c63005c373ea6e0299',
  'navbar-faq-tabs-carousel.html': '35cda0df80c2fbbbc40a0cc92155a965082095c72b17bbd48044518d9828083e',
  'navbar-only.html': '53a76303f46d1620e91c7e429b3f6c701ba386b760fe94a6159049651eeb7fa1',
  'runtime-segments.json': '3678fd3e3f4851c1159547f4c2441a353f7fc0c89b12a69d75a9584ccc7fae3d',
  'two-page-filter--2.html': 'b6884bd4e569222eac041e4c1c1de38e0981e04cb36b5a4b0dd17bab0aa00c4b',
}

/** [site slug, captured file]. Named here so a comparison cannot be silently dropped. */
const STRICT_SITES: Array<[string, string]> = [
  ['hero-only', 'hero-only.html'],
  ['two-page-filter', 'two-page-filter--2.html'],
]
const SCRIPT_SITES = ['navbar-only', 'navbar-faq-tabs-carousel']

const sha256 = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')
const readFixture = (file: string) => readFileSync(resolve(DIR, file), 'utf8')
const readSites = () => (JSON.parse(readFixture('sites.json')) as { sites: Entry[] }).sites
const findSite = (slug: string) => {
  const entry = readSites().find((site) => site.slug === slug)
  if (!entry) throw new Error(`sites.json is missing "${slug}"`)
  return entry
}
const renderPage = (site: Entry) => exportSiteToHTML(site.config, site.options ?? undefined)

/** Page 2 of a two-page entry. The page count is asserted so a third page fails loudly. */
function renderPage2(site: Entry): string {
  const pages = exportSitePages(site.config, site.options ?? undefined)
  expect(pages).toHaveLength(2)
  return pages[1].html
}

describe('frozen 0.6.0 fixtures are pinned', () => {
  it.each(Object.keys(FROZEN_SHA256).sort())('%s matches its recorded digest', (file) => {
    expect(sha256(readFixture(file))).toBe(FROZEN_SHA256[file])
  })

  it('has no orphan captured artifact on disk', () => {
    const onDisk = readdirSync(DIR).filter((file) => file.endsWith('.html') || file === 'runtime-segments.json')
    expect(new Set(onDisk)).toEqual(new Set(Object.keys(FROZEN_SHA256)))
  })

  it('every entry in sites.json is pinned, and no pin names a missing entry', () => {
    const expected = readSites().map((site) => (site.multipage ? `${site.slug}--2.html` : `${site.slug}.html`))
    expect(expected.sort()).toEqual(Object.keys(FROZEN_SHA256).filter((file) => file.endsWith('.html')).sort())
  })
})

describe('every pinned fixture is named by a comparison rule', () => {
  it('the comparison lists and the segment pin name every fixture', () => {
    // Deleting a slug from a list would otherwise leave a pinned fixture that
    // nothing compares: the digest and orphan checks would both still pass.
    const named = [
      ...STRICT_SITES.map(([, file]) => file),
      ...SCRIPT_SITES.map((slug) => `${slug}.html`),
      'runtime-segments.json',
    ]
    expect(named.sort()).toEqual(Object.keys(FROZEN_SHA256).sort())
  })
})

describe('byte identity against the frozen 0.6.0 export (strict)', () => {
  it.each(STRICT_SITES)('%s matches %s byte for byte', (slug, file) => {
    const site = findSite(slug)
    const fresh = site.multipage ? renderPage2(site) : renderPage(site)
    expect(stripSeoExpecting(fresh)).toBe(readFixture(file))
    // Implied by byte identity; named so the guarantee is asserted.
    expect(fresh).not.toContain('data-sb-runtime')
  })

  it('the captured multi-page reference carries no trace of the later block type', () => {
    // Page 2 must stay valid for ever: if a later release leaked the new block
    // onto it, the strict comparison would pass once and stop meaning anything.
    const page2 = readFixture('two-page-filter--2.html')
    expect(page2).not.toContain('card-grid')
    expect(page2).not.toContain('Unknown block type')
  })
})

describe('byte identity against the frozen 0.6.0 export (script text only)', () => {
  it.each(SCRIPT_SITES)('%s matches once the script text is emptied', (slug) => {
    const fresh = stripRuntimeScriptText(stripSeoExpecting(renderPage(findSite(slug))))
    const frozen = stripRuntimeScriptText(readFixture(`${slug}.html`))

    expect(fresh.counts.scripts, 'fresh runtime script element').toBe(1)
    expect(frozen.counts.scripts, 'frozen runtime script element').toBe(1)
    expect(fresh.html).toBe(frozen.html)
  })

  it('the no-script block of the combined page survives the strip unchanged', () => {
    const rules = /<noscript><style>[\s\S]*?<\/style><\/noscript>/
    const fresh = stripRuntimeScriptText(stripSeoExpecting(renderPage(findSite('navbar-faq-tabs-carousel')))).html
    const frozen = stripRuntimeScriptText(readFixture('navbar-faq-tabs-carousel.html')).html

    expect(fresh.match(rules)?.[0]).toBeDefined()
    expect(fresh.match(rules)?.[0]).toBe(frozen.match(rules)?.[0])
    expect(fresh).toContain('[data-sb-tablist]{display:none!important}')
    expect(fresh).toContain('[data-sb-carousel-slide]{display:block!important}')
  })

  it('a changed input is a failure, not a near match', () => {
    const site = findSite('navbar-only')
    const mutated = renderPage({ ...site, config: { ...site.config, name: 'Other' } })
    expect(stripRuntimeScriptText(mutated).html).not.toBe(stripRuntimeScriptText(readFixture('navbar-only.html')).html)
  })
})

describe('frozen runtime segment list', () => {
  const frozen = JSON.parse(readFixture('runtime-segments.json')) as string[]
  const current = BEHAVIOR_RUNTIME_SOURCE.split('\n')

  it('pins the 0.6.0 runtime source through its joined segments', () => {
    expect(frozen).toHaveLength(71)
    expect(sha256(frozen.join('\n'))).toBe(RUNTIME_SHA256_0_6_0)
    expect(frozen[frozen.length - 1]).toBe(LAST_SEGMENT)
  })

  it('keeps every 0.6.0 segment unchanged and in order, adding one contiguous run', () => {
    const check = checkRuntimeSegments(frozen, current)
    expect(check.missing, 'frozen segments no longer present').toEqual([])
    expect(check.oneRun, 'inserted lines are not one contiguous run').toBe(true)
    expect(check.beforeLast, 'inserted lines are not before the closing segment').toBe(true)
  })
})
