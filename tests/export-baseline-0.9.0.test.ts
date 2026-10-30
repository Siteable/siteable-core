/**
 * Frozen export baseline — the captured 0.9.0 exporter output.
 *
 * The files under `fixtures/export-baseline-0.9.0/` were captured from the
 * released 0.9.0 tag, before any source change was made, so that a later
 * change can be shown not to alter the export of sites that do not use the
 * new block.
 *
 * DO NOT regenerate, re-export or hand-edit the captured files. They are the
 * reference, not a derived artifact: a regenerated fixture would make every
 * comparison against it pass vacuously. Re-derivation is a review activity,
 * not a test run.
 *
 * Provenance
 * ----------
 * Released tag commit: ef07b298cee12d49c9e51f641eb6d5e1f258bda3
 * The capture ran against that commit with `src/` and `package.json`
 * byte-untouched, so the captured bytes are the 0.9.0 exporter's output and
 * not a re-render of a moved tree.
 *
 * Capture method: A throwaway Vitest capture script that rendered every entry of the input fixture with the exporter's single-page and multi-page entry points; the script was deleted right after the run.
 *
 * Aggregate digest (sha256 over the sorted `"<fileName>  <sha256>\n"` lines of
 * every captured file): f4fab7805866a4ddad4f03f62e6dbc45e1e8c0e9a95c33608354b925faae27bb
 *
 * `sites.json` is the INPUT fixture, not a captured artifact: it is not pinned
 * and not counted in the aggregate.
 *
 * Byte-identity comparison
 * ------------------------
 * The PRIMARY assertion is raw byte equality between a fresh render of the
 * current exporter and the captured bytes.
 *
 * The DOCUMENTED FALLBACK applies ONLY when the freshly rendered document
 * carries the precompiled-CSS style element (`counts.cssStyle > 0`). In that
 * case the precompiled stylesheet has no counterpart in the frozen bytes, so
 * both sides are normalized with `stripSeoHeadAdditions` and the STRIPPED
 * html strings are compared instead; the two sides' counts must be equal on
 * every key except `cssStyle`, and `outOfSet` must be empty on both sides.
 * When `counts.cssStyle === 0` — the case today — the raw byte comparison is
 * the assertion and the fallback does not run.
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { stripSeoHeadAdditions } from './helpers/seo-head-allowed-diff'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import type { SiteConfig } from '../src/blocks/types'

const DIR = resolve(import.meta.dirname, 'fixtures/export-baseline-0.9.0')

/** The released tag the captured files were produced from. */
const RELEASE_COMMIT = 'ef07b298cee12d49c9e51f641eb6d5e1f258bda3'

/** How the captured files were produced. Mirrored verbatim in the header. */
const CAPTURE_COMMAND =
  'A throwaway Vitest capture script that rendered every entry of the input fixture with the exporter\'s single-page and multi-page entry points; the script was deleted right after the run.'

/**
 * sha256 of every captured artifact. Any regeneration or hand-edit fails here.
 */
const FROZEN_SHA256: Record<string, string> = {
  'card-grid-filter.html': '369a0165717d78670f709be2e10bc28bad7d94595737825b15abfae47c4ef02f',
  'every-block-type.html': '2cf1009bd8c3f0cdcfadfdf62396090d168df6e802b7ddcf03d27f8d8a1641bd',
  'navbar-faq-tabs-carousel.html': '94dc6ade97f57d0868188595198bfed04f7c46bf229372e2e47c565a6ed1ec79',
  'single-page-with-settings--1.html': '5d0b9faa0b64fb07a683e6fa19744b4b1c130bc414725ea8d7f7ac392c7a6b4e',
  'site-with-url.html': '7d30fb188c25c24248e1a640ade5cb554b98e2f79603090425a91872948b43a2',
  'two-page--1.html': '7c445eaf01c88ee069c3549dbc315a78b097cea9325fe1e532f584767326aa3a',
  'two-page--2.html': 'a4d4598c22aadfeda99d77372a31b5e744d1c447977d59131131ac4565a15a27',
}

/**
 * Aggregate digest: sha256 over the SORTED lines `"<fileName>  <sha256>\n"`.
 * One value that moves when any captured file moves.
 */
const BASELINE_SHA256 = 'f4fab7805866a4ddad4f03f62e6dbc45e1e8c0e9a95c33608354b925faae27bb'

type Entry = {
  slug: string
  note: string
  config: Record<string, unknown>
  options?: { siteUrl?: string; settings?: Record<string, string> } | null
  multipage?: boolean
}

/** Every captured page file, by name. */
const EXPECTED_FILES = [
  'every-block-type.html',
  'single-page-with-settings--1.html',
  'navbar-faq-tabs-carousel.html',
  'card-grid-filter.html',
  'two-page--1.html',
  'two-page--2.html',
  'site-with-url.html',
]

/** Which captured files each declared site is expected to produce. */
const EXPECTED_FILES_BY_SLUG: Record<string, string[]> = {
  'every-block-type': ['every-block-type.html'],
  'single-page-with-settings': ['single-page-with-settings--1.html'],
  'navbar-faq-tabs-carousel': ['navbar-faq-tabs-carousel.html'],
  'card-grid-filter': ['card-grid-filter.html'],
  'two-page': ['two-page--1.html', 'two-page--2.html'],
  'site-with-url': ['site-with-url.html'],
}

const readSites = (): { note?: string; sites: Entry[] } =>
  JSON.parse(readFileSync(resolve(DIR, 'sites.json'), 'utf8'))

const sha256Bytes = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const sha256Text = (text: string): string => sha256Bytes(Buffer.from(text, 'utf8'))

/** The digest of one captured file, over its bytes as they sit on disk. */
const fileDigest = (file: string): string => sha256Bytes(readFileSync(resolve(DIR, file)))

/** The aggregate digest recomputed from the pinned per-file digests. */
const aggregateDigest = (): string => {
  const lines = Object.keys(FROZEN_SHA256)
    .sort()
    .map((file) => `${file}  ${FROZEN_SHA256[file]}\n`)
    .join('')
  return sha256Text(lines)
}

/** This file's own source, for the provenance check. */
const ownSource = (): string =>
  readFileSync(resolve(import.meta.dirname, 'export-baseline-0.9.0.test.ts'), 'utf8')

/** The leading block comment of this file — where the provenance is recorded. */
const ownHeader = (): string => {
  const source = ownSource()
  const end = source.indexOf('*/')
  return end === -1 ? '' : source.slice(0, end + 2)
}

describe('the frozen 0.9.0 baseline is present', () => {
  it('sites.json exists and declares a list of sites', () => {
    expect(existsSync(resolve(DIR, 'sites.json'))).toBe(true)
    const parsed = readSites()
    expect(typeof parsed).toBe('object')
    expect(Array.isArray(parsed.sites)).toBe(true)
    expect(typeof parsed.note).toBe('string')
    expect(parsed.note!.length).toBeGreaterThan(0)
  })

  it('every expected page file exists and is not empty', () => {
    for (const file of EXPECTED_FILES) {
      const path = resolve(DIR, file)
      expect(existsSync(path), `${file} is missing`).toBe(true)
      expect(statSync(path).size, `${file} is empty`).toBeGreaterThan(0)
    }
  })

  it('every captured file is an HTML document', () => {
    for (const file of EXPECTED_FILES) {
      const html = readFileSync(resolve(DIR, file), 'utf8')
      expect(html, `${file} has no doctype`).toContain('<!DOCTYPE html>')
      expect(html, `${file} has no html tag`).toMatch(/<html[\s>]/)
    }
  })
})

describe('the frozen 0.9.0 baseline is internally consistent', () => {
  it('every declared site carries a slug, a config and a note', () => {
    for (const site of readSites().sites) {
      expect(typeof site.slug, 'slug').toBe('string')
      expect(site.slug.length).toBeGreaterThan(0)
      expect(typeof site.config, `config of ${site.slug}`).toBe('object')
      expect(site.config).not.toBeNull()
      expect(typeof site.note, `note of ${site.slug}`).toBe('string')
      expect(site.note.length).toBeGreaterThan(0)
    }
  })

  it('sites.json declares exactly the captured pages', () => {
    const sites = readSites().sites
    expect(sites.map((site) => site.slug).sort()).toEqual(Object.keys(EXPECTED_FILES_BY_SLUG).sort())

    const declared = sites.flatMap((site) => EXPECTED_FILES_BY_SLUG[site.slug] ?? [])
    expect(declared.sort()).toEqual([...EXPECTED_FILES].sort())
  })

  it('the multi-page site declares exactly two pages', () => {
    const site = readSites().sites.find((entry) => entry.slug === 'two-page')
    expect(site, 'sites.json is missing "two-page"').toBeDefined()
    expect(site!.multipage).toBe(true)
    expect(Array.isArray(site!.config.pages)).toBe(true)
    expect(site!.config.pages).toHaveLength(2)
  })

  it('the site with a URL carries that URL, so its canonical link and structured data are populated', () => {
    const site = readSites().sites.find((entry) => entry.slug === 'site-with-url')
    expect(site, 'sites.json is missing "site-with-url"').toBeDefined()
    expect(typeof site!.options?.siteUrl).toBe('string')
    expect(site!.options!.siteUrl!.length).toBeGreaterThan(0)
  })
})

describe('the frozen 0.9.0 baseline is pinned', () => {
  it.each(Object.keys(FROZEN_SHA256).sort())('%s matches its recorded digest', (file) => {
    expect(fileDigest(file)).toBe(FROZEN_SHA256[file])
  })

  it('the recomputed aggregate digest matches the recorded one', () => {
    expect(aggregateDigest()).toBe(BASELINE_SHA256)
  })

  it('has no orphan captured artifact on disk', () => {
    const onDisk = readdirSync(DIR).filter((file) => file.endsWith('.html'))
    expect(new Set(onDisk), 'a captured file on disk is not pinned').toEqual(
      new Set(Object.keys(FROZEN_SHA256)),
    )
  })

  it('every pinned artifact exists on disk', () => {
    for (const file of Object.keys(FROZEN_SHA256)) {
      expect(existsSync(resolve(DIR, file)), `${file} is pinned but missing`).toBe(true)
    }
  })

  it('the input fixture is not pinned as a captured artifact', () => {
    expect(Object.keys(FROZEN_SHA256)).not.toContain('sites.json')
  })
})

describe('the provenance of the frozen 0.9.0 baseline is recorded', () => {
  it('the header names the released commit the capture came from', () => {
    expect(ownHeader()).toContain(RELEASE_COMMIT)
  })

  it('the header names the capture command', () => {
    expect(ownHeader()).toContain(CAPTURE_COMMAND)
  })

  it('the header records the aggregate digest', () => {
    expect(ownHeader()).toContain(BASELINE_SHA256)
  })

  it('the header carries no unresolved placeholder', () => {
    expect(ownHeader()).not.toMatch(/PLACEHOLDER/)
  })
})

describe('byte identity against the frozen 0.9.0 export', () => {
  const compare = (fresh: string, frozen: string, label: string) => {
    const freshStripped = stripSeoHeadAdditions(fresh)
    if (freshStripped.counts.cssStyle === 0) {
      // The documented primary assertion: raw byte equality.
      expect(fresh, `${label} is not byte-identical`).toBe(frozen)
      return
    }
    // The documented fallback: the fresh document carries the precompiled-CSS
    // style element, so both sides are normalized before comparison.
    const frozenStripped = stripSeoHeadAdditions(frozen)
    for (const key of Object.keys(freshStripped.counts) as Array<keyof typeof freshStripped.counts>) {
      if (key === 'cssStyle') continue
      expect(freshStripped.counts[key], `${label}: ${key} count`).toBe(frozenStripped.counts[key])
    }
    expect(freshStripped.outOfSet, `${label}: fresh additions out of set`).toEqual([])
    expect(frozenStripped.outOfSet, `${label}: frozen additions out of set`).toEqual([])
    expect(freshStripped.html, `${label} is not identical after the allowed strip`).toBe(
      frozenStripped.html,
    )
  }

  it.each(readSites().sites.map((site) => site.slug))(
    '%s matches its captured bytes',
    (slug) => {
      const site = readSites().sites.find((entry) => entry.slug === slug)!
      const config = site.config as unknown as SiteConfig
      const options = site.options ?? undefined

      if (site.multipage) {
        const pages = exportSitePages(config, options)
        const captured = EXPECTED_FILES_BY_SLUG[slug] ?? []
        expect(pages, `${slug}: rendered page count`).toHaveLength(captured.length)
        captured.forEach((file, index) => {
          compare(pages[index].html, readFileSync(resolve(DIR, file), 'utf8'), `${slug} / ${file}`)
        })
        return
      }

      const fresh = exportSiteToHTML(config, options)
      const file = `${slug}.html`
      compare(fresh, readFileSync(resolve(DIR, file), 'utf8'), `${slug} / ${file}`)
    },
  )
})
