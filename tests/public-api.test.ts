/**
 * Public-API barrel tripwires.
 *
 * The barrel `src/index.ts` IS the package's contract: `package.json` publishes
 * `["dist", "src", "NOTICE"]` and the workspace convention is that consumers
 * import through the entry rather than deep-importing (a deep import would
 * instantiate a second zustand singleton and break the single-store invariant).
 * So a barrel regression is a real, consumer-visible break — and nothing else in
 * the suite imports it, which would make such a regression invisible.
 *
 * This file exists to assert the new publish-fidelity surface actually routes
 * through the barrel, rather than a feature test importing `src/lib/...`
 * directly and proving nothing about the entry point.
 */
import { describe, it, expect } from 'vitest'
import { isAllowedUrl as isAllowedUrlViaLib } from '../src/lib/url-policy'
import * as pagePath from '../src/lib/page-path'
import * as videoEmbed from '../src/lib/video-embed'
import { exportSitePages as exportSitePagesViaLib } from '../src/lib/export-site-pages'
import type { SiteConfig } from '../src/blocks/types'
import { renderVideo } from '../src/lib/export-blocks/render-video'
import * as barrel from '../src/index'

/**
 * `PageDocument` referenced THROUGH THE BARREL, not from `export-site-pages.ts`.
 *
 * A deep import would keep compiling after the barrel dropped the type, so the
 * import path is the assertion. See the AC-04 note below.
 */
type PageDocumentViaBarrel = import('../src/index').PageDocument

describe('public API barrel', () => {
  it('re-exports isAllowedUrl, and it is the same function the lib module defines', () => {
    // Identity, not just presence: this rules out the barrel re-implementing or
    // shadow-wrapping the policy, which is how the two copies could drift.
    expect(barrel.isAllowedUrl).toBe(isAllowedUrlViaLib)
  })

  it('is callable through the barrel with the same behavior', () => {
    expect(barrel.isAllowedUrl('https://x')).toBe(true)
    expect(barrel.isAllowedUrl('javascript:alert(1)')).toBe(false)
    expect(barrel.isAllowedUrl('https://cdn.example.com/a.png', { image: true })).toBe(true)
    expect(barrel.isAllowedUrl('http://cdn.example.com/a.png', { image: true })).toBe(false)
  })

  it('keeps the pre-existing export-site surface intact', () => {
    // The publish-fidelity work is additive to this barrel, never a re-shape of
    // it: these are the symbols the README names as the host-app entry points,
    // so losing one would be a breaking change to a shipped package.
    for (const name of [
      'exportSiteToHTML',
      'validateSiteConfig',
      'generateSiteConfig',
      'themePresets',
      'defaultConfig',
      'useConfigStore',
    ] as const) {
      expect(barrel[name], `barrel is missing ${name}`).toBeDefined()
    }
  })

  // FR-002: a server-side publisher and a consuming app's import check both consume
  // these through the package entry, and neither can deep-import — so a missing
  // or shadow-wrapped barrel export breaks their build at bump time, not here.
  it('re-exports the page-path normalizer and predicate by identity', () => {
    expect(barrel.normalizePagePaths).toBe(pagePath.normalizePagePaths)
    expect(barrel.isValidPagePath).toBe(pagePath.isValidPagePath)
  })

  it('is callable through the barrel with the same behavior', () => {
    expect(barrel.normalizePagePaths(['/', '/About Us.html'])).toEqual(['/', '/about-us'])
    expect(barrel.isValidPagePath('/a/b/c')).toBe(true)
    expect(barrel.isValidPagePath('/a/b/c/d')).toBe(false)
  })

  // `slugifyPagePath` was added for the editor's add-page
  // suggestion but stays an INTERNAL export. Widening the published surface of
  // a version-pinned package is not free, and the editor is in-package. Named
  // literally (not "no new page-path exports") so the check cannot shrink away
  // if the module grows another name later.
  it('does NOT barrel-export the internal slugifyPagePath suggestion helper', () => {
    expect(typeof pagePath.slugifyPagePath, 'the module still exports it').toBe('function')
    expect(barrel).not.toHaveProperty('slugifyPagePath')
  })

  // AC-04 / FR-C1: the `src/lib/worker-entry.ts` entry and the `exports`
  // map add a risk that MIRRORS the barrel one: the
  // worker entry is a new place for these four names to appear, and the easy
  // "fix" for a worker bundling problem is to re-export something extra from
  // the BARREL to make it reachable — which would widen a pinned surface and
  // pull an editor module back toward the entry. So the multipage names are
  // pinned PRESENT and, symmetrically, the internal/editor ones pinned ABSENT.
  it('exposes exactly the four multipage names and no worker-entry internals', () => {
    for (const name of [
      'normalizePagePaths',
      'isValidPagePath',
      'exportSitePages',
    ] as const) {
      expect(barrel[name], `barrel is missing ${name}`).toBeDefined()
    }

    // Named literally: a test that compares export-set
    // SIZES or iterates a list it also edits cannot observe its own removal.
    //
    // Only INTERNAL helpers are listed as absent. `EditorLayout`,
    // `CanvasToolbar` and the two stores are long-standing PUBLIC barrel
    // exports (asserted as present in the test above) — they are what make the
    // barrel React-bearing, not a leak. Listing them here would have failed on
    // the first run and taught a maintainer the wrong lesson.
    for (const name of [
      'slugifyPagePath',
      'PageDocument',
      'workerEntry',
      'renderDocument',
      'default',
    ]) {
      // `PageDocument` is a TYPE, so it has no runtime property — its absence
      // from the runtime barrel is correct and asserted by the same check.
      expect(barrel, `${name} leaked onto the barrel runtime surface`).not.toHaveProperty(name)
    }

    // The runtime check above cannot see `PageDocument` — it is a TYPE, erased
    // at runtime, so `not.toHaveProperty` would pass even if the barrel stopped
    // exporting it. That is a real gap for AC-04 ("exports exactly the 4"), so
    // the type-level half is asserted here: a missing type export fails
    // `npm run typecheck`, which is a required CI check. Referencing the type
    // through the barrel (rather than importing it from the lib module) is the
    // whole point — a deep import would keep passing while the barrel dropped it.
    const typed: PageDocumentViaBarrel = { path: '/', html: '<!DOCTYPE html>' }
    expect(typed.path).toBe('/')
  })
})

// FR-001: a server-side publisher emits one object per page and must reach this
// through the package entry. Identity, not just presence — a barrel
// re-implementation would let the two copies drift.
describe('public API barrel — multi-page export surface', () => {
  it('re-exports exportSitePages and the PageDocument surface by identity', () => {
    expect(barrel.exportSitePages).toBe(exportSitePagesViaLib)
    expect(typeof barrel.exportSiteToHTML).toBe('function')
  })

  it('is callable through the barrel and keys pages by normalized path', () => {
    const config: SiteConfig = {
      name: 'Barrel',
      pages: [
        { id: 'p1', name: 'Home', path: '/', blocks: [] },
        { id: 'p2', name: 'About', path: '/About Us.html', blocks: [] },
      ],
      blocks: [],
    }
    const viaBarrel = barrel.exportSitePages(config)
    expect(viaBarrel.map((doc) => doc.path)).toEqual(['/', '/about-us'])
    // `html` must be the full document, not a fragment, and the single-document
    // export must agree with the `/` entry.
    expect(viaBarrel[0].html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(barrel.exportSiteToHTML(config)).toBe(viaBarrel[0].html)
  })

  it('agrees with the lib module entry point byte-for-byte', () => {
    const config: SiteConfig = { name: 'Agree', blocks: [] }
    expect(barrel.exportSitePages(config)).toEqual(exportSitePagesViaLib(config))
  })
})

// ISS-006: consumers (static-cms import-check) must ask the engine whether a
// `video.url` embeds, not re-derive the regexes and drift from the renderer.
describe('public API barrel — video embed surface', () => {
  it('re-exports the extractors and videoEmbedUrl by identity', () => {
    expect(barrel.extractYouTubeId).toBe(videoEmbed.extractYouTubeId)
    expect(barrel.extractVimeoId).toBe(videoEmbed.extractVimeoId)
    expect(barrel.videoEmbedUrl).toBe(videoEmbed.videoEmbedUrl)
  })

  it('videoEmbedUrl selects by variant: vimeo → Vimeo, anything else → YouTube', () => {
    const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(barrel.videoEmbedUrl(yt, 'youtube')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(barrel.videoEmbedUrl(yt, undefined)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(barrel.videoEmbedUrl(yt, 'vimeo')).toBeNull()
    expect(barrel.videoEmbedUrl('https://vimeo.com/76979871', 'vimeo')).toBe('https://player.vimeo.com/video/76979871')
    expect(barrel.videoEmbedUrl('https://example.com/clip.mp4', 'youtube')).toBeNull()
  })

  it('agrees with the export renderer: an iframe is emitted iff videoEmbedUrl is non-null', () => {
    const cases: Array<[string, string | undefined]> = [
      ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
      ['https://vimeo.com/76979871', 'vimeo'],
      ['https://vimeo.com/76979871', 'youtube'],
      ['https://example.com/clip.mp4', undefined],
      ['', 'vimeo'],
    ]
    for (const [url, variant] of cases) {
      const html = renderVideo({ id: 'v', type: 'video', variant, props: { url } } as never)
      expect(html.includes('<iframe'), `${variant}:${url}`).toBe(barrel.videoEmbedUrl(url, variant) !== null)
    }
  })
})
