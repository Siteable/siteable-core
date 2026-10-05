/**
 * NF-006 / SC-025 (source half) — the publish-fidelity work adds no runtime
 * dependency.
 *
 * Spec: `specs/publish-fidelity/spec.md` NF-006 ("no new runtime dependency may
 * be added to the package; the markdown subset renderer is implemented in-repo")
 * and SC-025. Phase-07 of the publish-fidelity plan.
 *
 * The MANIFEST half of SC-025 (an empty/unchanged `dependencies` block, an
 * unchanged `peerDependencies` block) lives in `tests/package-manifest.test.ts`.
 * This file proves the other direction: none of the modules this atom added or
 * rewired reaches outside the package. A relative (`./`, `../`) or internal
 * (`@/`) specifier stays inside the bundle; anything else is a bare specifier
 * that would drag a runtime package into the published output.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Every module the publish-fidelity atom added or rewired: the URL policy, the
 * markdown-subset renderer, the shared link/escape/prop helpers, and the six new
 * export renderers. All of them must stay package-internal (NF-006).
 */
const ATOM_MODULES = [
  'src/lib/url-policy.ts',
  'src/lib/html-escape.ts',
  'src/lib/markdown-html.ts',
  'src/lib/render-link.ts',
  'src/lib/render-prop.ts',
  'src/lib/link-item.ts',
  'src/lib/video-embed.ts',
  'src/lib/export-blocks/render-banner.ts',
  'src/lib/export-blocks/render-content.ts',
  'src/lib/export-blocks/render-divider.ts',
  'src/lib/export-blocks/render-gallery.ts',
  'src/lib/export-blocks/render-image.ts',
  'src/lib/export-blocks/render-video.ts',
]

/** Repo-root-relative reader, anchored to this test file rather than `process.cwd()`. */
function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8')
}

/** Every module specifier a source file imports or re-exports. */
function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm),
    ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/^\s*export\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm),
  ].map((match) => match[1])
}

/**
 * A specifier is package-INTERNAL when it is relative (`./`, `../`) or uses the
 * repo's own `@/` path alias (`@/lib/...` → `src/lib/...`). The alias `@/` is
 * unambiguously internal — a scoped npm package is spelled `@scope/name`, never
 * `@/`. Anything else (a bare package name or a `node:` builtin) is EXTERNAL.
 */
function isExternalSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('@/')
}

describe('NF-006 — the atom\'s modules stay package-internal', () => {
  it('the import detector actually detects imports (non-vacuous guard)', () => {
    // Without this, a regression that made `importSpecifiers` return [] would
    // leave every `toEqual([])` assertion passing while testing nothing.
    expect(importSpecifiers(readRepoFile('src/lib/render-link.ts')).sort()).toEqual([
      './html-escape',
      './url-policy',
    ])
  })

  it.each(ATOM_MODULES)('%s imports no external package', (relativePath) => {
    const external = importSpecifiers(readRepoFile(relativePath)).filter(isExternalSpecifier)
    expect(external).toEqual([])
  })

  it('the shared URL-policy module remains fully import-free', () => {
    // Stronger than "no external": the policy is pulled into the editor, the
    // normalizer and the exporter, so ANY import (even relative) would risk a
    // cycle. It must import nothing at all.
    expect(importSpecifiers(readRepoFile('src/lib/url-policy.ts'))).toEqual([])
  })
})
