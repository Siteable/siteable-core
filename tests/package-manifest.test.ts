/**
 * SC-025 / NF-006 — package-manifest tripwires for the publish-fidelity work.
 *
 * Spec: `specs/publish-fidelity/spec.md` NF-006 ("no new runtime dependency may
 * be added to the package; the markdown subset renderer is implemented in-repo")
 * and SC-025 ("Given the package manifest, when compared to the pre-change
 * manifest, then no new runtime dependency is present").
 *
 * These assertions live at package level rather than inside a feature suite, so a
 * future violation fails here instead of failing an unrelated feature test for a
 * reason that has nothing to do with that feature.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Committed baseline — the manifest's runtime deps as of the pre-change commit. */
const BASELINE_RUNTIME_DEPS: string[] = []

/**
 * Committed baseline — the manifest's peer deps as of the pre-change commit.
 *
 * Pinned as a literal rather than diffed against `git show HEAD:package.json`:
 * a HEAD-relative baseline silently becomes a no-op the moment this test lands
 * on `main`, and it would make a unit test fail for an environmental reason (no
 * git in CI) instead of a code reason.
 */
const BASELINE_PEER_DEPS = [
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  'immer',
  'lucide-react',
  'react',
  'react-dom',
  'sonner',
  'tailwindcss',
  'zustand',
]

/**
 * The shared URL-policy module must stay import-free so it can be pulled into the
 * editor, the property normalizer and the exporter without creating a dependency
 * cycle or dragging a package into the bundle.
 */
const IMPORT_FREE_MODULES = ['src/lib/url-policy.ts']

/** Repo-root-relative reader, anchored to this test file rather than `process.cwd()`. */
function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8')
}

describe('SC-025 / NF-006 — package manifest', () => {
  it('adds no new runtime dependency', () => {
    const manifest = JSON.parse(readRepoFile('package.json')) as {
      dependencies?: Record<string, string>
    }

    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(
      BASELINE_RUNTIME_DEPS
    )
  })

  it('adds no new peer dependency', () => {
    // Peer deps are a second, easier-to-miss channel for NF-006: adding a
    // required peer would change the package's install contract.
    const current = JSON.parse(readRepoFile('package.json')) as {
      peerDependencies?: Record<string, string>
    }

    expect(Object.keys(current.peerDependencies ?? {}).sort()).toEqual(
      BASELINE_PEER_DEPS
    )
  })
})

describe('NF-006 — import-free modules', () => {
  it.each(IMPORT_FREE_MODULES)('%s imports nothing', (relativePath) => {
    const source = readRepoFile(relativePath)

    // Static `import ...`, dynamic `import(`, and re-exporting
    // `export ... from './x'` would each drag something into the bundle.
    const dependencies = [
      ...source.matchAll(/^\s*import\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm),
      ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...source.matchAll(/^\s*export\s[\s\S]*?from\s+['"]([^'"]+)['"]/gm),
    ].map((match) => match[1])

    expect(dependencies).toEqual([])
  })
})
