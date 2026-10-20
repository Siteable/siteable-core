/**
 * Loaders for the frozen 0.4.0 export baseline inputs.
 *
 * The baseline suite and the later tab-markup suites both need to render the
 * SAME inputs the frozen fixtures were captured from, so the loading lives here
 * rather than being duplicated: a divergent loader would silently compare
 * against the wrong document.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportSiteToHTML } from '../../src/lib/export-html'
import { exportSitePages } from '../../src/lib/export-site-pages'
import type { SiteConfig } from '../../src/blocks/types'

export const BASELINE_DIR = resolve(
  import.meta.dirname,
  '../fixtures/export-baseline-0.4.0',
)
const CORPUS_DIR = resolve(import.meta.dirname, '../fixtures/export-legacy-corpus')

export interface BaselineSite {
  slug: string
  note: string
  config: SiteConfig
  options?: { settings?: Record<string, string> } | null
  multipage?: boolean
}

export interface CorpusEntry {
  slug: string
  config: SiteConfig
  options?: { settings?: Record<string, string> } | null
}

/** The corpus JSONs in the order `corpus-NN.html` was captured in. */
const CORPUS_SLUGS = [
  '01-blocks-only-every-block-type',
  '02-blocks-only-empty',
  '03-pages-empty-list',
  '04-single-page-home',
  '05-single-page-home-with-settings',
  '06-single-page-home-with-theme',
]

export function readCorpus(): CorpusEntry[] {
  return CORPUS_SLUGS.map((sourceSlug, index) => {
    const entry = JSON.parse(
      readFileSync(resolve(CORPUS_DIR, `${sourceSlug}.json`), 'utf8'),
    ) as CorpusEntry
    // Each corpus file records its own slug. Asserting it matches the expected
    // name makes the mapping explicit: if `CORPUS_SLUGS` were ever reordered or
    // a file renamed, this throws here rather than silently pairing a config
    // with the wrong frozen document.
    if (entry.slug !== sourceSlug) {
      throw new Error(`corpus file ${sourceSlug}.json declares slug "${entry.slug}"`)
    }
    return {
      ...entry,
      options: entry.options ?? null,
      slug: `corpus-${String(index + 1).padStart(2, '0')}`,
    }
  })
}

export function readSites(): BaselineSite[] {
  return (
    JSON.parse(readFileSync(resolve(BASELINE_DIR, 'sites.json'), 'utf8')) as {
      sites: BaselineSite[]
    }
  ).sites
}

export function findSite(slug: string): BaselineSite {
  const entry = readSites().find((site) => site.slug === slug)
  if (!entry) throw new Error(`sites.json is missing "${slug}"`)
  return entry
}

export function fixtureHtml(file: string): string {
  return readFileSync(resolve(BASELINE_DIR, file), 'utf8')
}

/** Render an entry exactly the way the capture did. */
export function render(entry: BaselineSite | CorpusEntry): string {
  return exportSiteToHTML(entry.config, entry.options ?? undefined)
}

/** Every captured file name, derived from the inputs rather than hardcoded. */
export function capturedFileNames(): string[] {
  return readSites()
    .flatMap((site) =>
      site.multipage
        ? (site.config.pages ?? []).map((_, i) => `${site.slug}--${i + 1}.html`)
        : [`${site.slug}.html`],
    )
    .concat(readCorpus().map((entry) => `${entry.slug}.html`))
}

/**
 * The captured files actually sitting in the fixture directory.
 *
 * Compared alongside the derived names so an ORPHAN — a stray `.html` that is in
 * neither the inputs nor the pin table — is caught. Without this a dropped file
 * would be invisible to every test: nothing would compare it, and nothing would
 * assert it should exist.
 */
export function capturedFilesOnDisk(): string[] {
  return readdirSync(BASELINE_DIR).filter((file) => file.endsWith('.html'))
}

export { exportSitePages }
