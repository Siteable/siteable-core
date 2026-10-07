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
import { beforeAll, describe, it, expect } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureFreshBuild, isArtifactStale } from './helpers/ensure-fresh-build'

/**
 * Every module the publish-fidelity atom added or rewired: the URL policy, the
 * markdown-subset renderer, the shared link/escape/prop helpers, and the six new
 * export renderers. All of them must stay package-internal (NF-006).
 *
 * Note: `src/lib/export-site-pages.ts` no longer sits in the worker's
 * import closure ALONE — it pulls `export-html.ts`, which pulls theme presets,
 * the URL policy, six `export-blocks/*` renderers and more. That is precisely
 * the H3 defect this list could not express, so the worker-facing guarantee is
 * now made by the TRANSITIVE WALKER below (FR-H3), which needs no list at all.
 * These entries remain for the publish-fidelity half of the claim (NF-006: no
 * new runtime dependency), which is about specific modules, not the closure.
 */
const ATOM_MODULES = [
  'src/lib/url-policy.ts',
  'src/lib/html-escape.ts',
  'src/lib/markdown-html.ts',
  'src/lib/render-link.ts',
  'src/lib/render-prop.ts',
  'src/lib/link-item.ts',
  'src/lib/page-path.ts',
  'src/lib/video-embed.ts',
  'src/lib/export-site-pages.ts',
  'src/lib/export-blocks/render-banner.ts',
  'src/lib/export-blocks/render-content.ts',
  'src/lib/export-blocks/render-divider.ts',
  'src/lib/export-blocks/render-gallery.ts',
  'src/lib/export-blocks/render-image.ts',
  'src/lib/export-blocks/render-video.ts',
]

/**
 * Modules this project has explicitly tasked the strong, zero-import guard with
 * (NF-005 bundle claim), not merely the "no external package" list above.
 */
const GUARDED_MODULES = ['src/lib/url-policy.ts', 'src/lib/page-path.ts']

/** Repo root, anchored to this test file rather than `process.cwd()`. */
const REPO_ROOT = resolve(import.meta.dirname, '..')

/** Repo-root-relative reader, anchored to this test file rather than `process.cwd()`. */
function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
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

  it.each(GUARDED_MODULES)(
    '%s is pulled into a worker bundle, so it must import nothing at all',
    (relativePath) => {
      // Stronger than "no external": a relative import of a UI helper is
      // invisible to `isExternalSpecifier` but would drag React into a
      // server or edge worker that imports the normalizer or the predicate, and
      // url-policy likewise feeds the editor, the normalizer and the exporter,
      // so ANY import (even relative) risks a cycle. `[]` is the only form of
      // this assertion that actually covers the risk being claimed.
      expect(importSpecifiers(readRepoFile(relativePath))).toEqual([])
    },
  )

  it('still guards the multipage normalizer (literal, not list-driven)', () => {
    // Both guards here are list-driven, which is their own silent failure mode:
    // delete a module from ATOM_MODULES *and* from the it.each list, and every
    // assertion above still passes while the module stops being guarded.
    //
    // The module name is a LITERAL in this assertion on purpose. An earlier
    // version iterated a GUARDED_MODULES constant instead, which made it
    // self-referential: mutating that constant removed the entry from the
    // loop's body too, so the check could never observe its own removal and the
    // mutation survived. A check validated by the same list it edits is no check.
    expect(ATOM_MODULES).toContain('src/lib/page-path.ts')
  })

  // FR-001: `exportSitePages` is the entry point a server-side publisher calls, so it has
  // to reach a worker bundle without pulling a UI framework in. Its own module
  // name is a LITERAL for the same reason as the one above — a list-driven
  // guard can be mutated out of existence together with the check.
  it('still guards the multi-page exporter (literal, not list-driven)', () => {
    expect(ATOM_MODULES).toContain('src/lib/export-site-pages.ts')
  })
})

// ---------------------------------------------------------------------------
// FR-H3 / NF-005 — the TRANSITIVE import closure of the worker entry.
// ---------------------------------------------------------------------------
//
// H3: `export-site-pages.ts` imports `renderDocument` from `export-html.ts`, and
// `export-html.ts` imports theme presets, the URL policy, script-literal and six
// `export-blocks/*` renderers — NONE of which were in `ATOM_MODULES`. The old
// guard checked each listed module's OWN import lines, so a future
// `import { X } from '@/components/Foo'` inside `export-html.ts` passed every
// NF-005 assertion and broke the worker bundle. The check was blind to exactly
// the path the new export actually takes.
//
// D4: walk the closure instead of extending the list. A list is validated by the
// same edit that breaks it — add an import, forget the list, guard still green
// (the same trap twice). A closure needs no list upkeep (it is still a text scan - see `stripComments`;
// the built-artifact block below is the backstop). The walk is
// rooted at `src/lib/worker-entry.ts`, the same module `vite build` emits as
// `dist/worker.js`, so this source check and the built-artifact check below are
// two views of ONE set rather than two independently drifting claims.

/** The module the `@siteable/core/worker` subpath is built from. */
const WORKER_ENTRY = 'src/lib/worker-entry.ts'

/** Extensions an extensionless or directory import may resolve to. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx']

/**
 * A module source map. Real runs read the repo; the teeth-check tests pass a
 * synthetic map instead, so they can prove the walker DETECTS a leak on every
 * suite pass without mutating real source on disk.
 */
export type SourceMap = Record<string, string>

/** The `@/` alias target, read out of vite.config.ts rather than hardcoded (D4). */
function aliasRoot(): string {
  const viteConfig = readRepoFile('vite.config.ts')
  const match = viteConfig.match(/'@':\s*resolve\(__dirname,\s*'([^']+)'\)/)
  if (!match) {
    throw new Error(
      "could not read the '@' alias out of vite.config.ts — the walker cannot " +
        'resolve internal imports without it. If the alias config moved, fix this ' +
        'reader; do not let every internal import look external.',
    )
  }
  return match[1]
}

/**
 * Every module specifier a source file imports or re-exports.
 *
 * Deliberately different from the NF-006 `importSpecifiers` above, which requires
 * whitespace after `import` and so misses `import{a}from'react'`. That gap
 * was deliberately left unfixed for the publish-fidelity list; it
 * CANNOT be left unfixed here, because for the worker closure a single missed
 * specifier is exactly the React import this exists to catch. Duplication of the
 * scanner is the accepted cost of two different claims (a documented house
 * gap vs. a hard guarantee); a comment says so at each definition.
 */
/**
 * Blank out `/* … *\/` and `// …` comments, preserving line structure.
 *
 * Comments are stripped FIRST everywhere in this file, and that is load-bearing
 * rather than cosmetic: `worker-entry.ts` and several lib modules carry PROSE
 * that names specifiers — "reachable as `@siteable/core/worker`", "never
 * barrel-exports `slugifyPagePath`" — and a scanner that reads comments reports
 * those as imports and names. An earlier guard hit this exact class of bug (its
 * determinism scan had to strip line comments for the same reason). A guard that
 * reads prose is a guard that gets abandoned as a false positive.
 *
 * `[^:]` before `//` avoids eating the `//` in a URL inside a string literal —
 * imperfect, and it can OVER-strip: a `'/*'` string literal before a real
 * import blanks that import, so the SOURCE walker returns `[]` for it. That is
 * a known blind spot, not a safe direction - the BUILT-artifact checks further
 * down are the real gate.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ')
}

function closureImportSpecifiers(rawSource: string): string[] {
  const source = stripComments(rawSource)

  return [
    ...source.matchAll(/\bimport\s*[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bexport\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1])
}

/** `true` when a specifier reaches OUTSIDE this package (bare name or `node:`). */
function isBareSpecifier(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('@/')
}

/** Normalize a repo-relative path to forward slashes, no leading `./`. */
function repoPath(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath).split(sep).join('/')
}

/** Read a module's source from the synthetic map, or from disk when absent. */
function readModule(relativePath: string, sources?: SourceMap): string {
  if (sources && Object.hasOwn(sources, relativePath)) return sources[relativePath]
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8')
}

/**
 * Walk the transitive internal-import closure of `entry`.
 *
 * Returns `{ closure, violations }`. `violations` lists every bare specifier
 * found in ANY module of the closure, tagged with the file that imports it, so a
 * failure names the culprit rather than just the entry.
 *
 * An UNRESOLVABLE import throws rather than being skipped: a walker that
 * quietly stops at a typo reproduces exactly the blind spot this file exists to
 * remove, and would report a clean closure while having checked nothing.
 */
export function walkClosure(
  entry: string,
  sources?: SourceMap,
): { closure: string[]; violations: Array<{ from: string; specifier: string }> } {
  const alias = aliasRoot()
  const closure: string[] = []
  const violations: Array<{ from: string; specifier: string }> = []
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current)) continue
    seen.add(current)
    closure.push(current)

    for (const specifier of closureImportSpecifiers(readModule(current, sources))) {
      if (isBareSpecifier(specifier)) {
        violations.push({ from: current, specifier })
        continue
      }

      const target = specifier.startsWith('@/')
        ? resolve(REPO_ROOT, alias, specifier.slice(2))
        : resolve(dirname(resolve(REPO_ROOT, current)), specifier)

      // Extensionless file, directory index, or an already-complete path.
      const candidates = [
        ...SOURCE_EXTENSIONS.map((ext) => target + ext),
        ...SOURCE_EXTENSIONS.map((ext) => resolve(target, `index${ext}`)),
        target,
      ]
      const hit = candidates.find((candidate) => {
        if (sources && Object.hasOwn(sources, repoPath(candidate))) return true
        return existsSync(candidate) && statSync(candidate).isFile()
      })
      if (!hit) {
        throw new Error(
          `closure walk could not resolve "${specifier}" imported by ${current}. The walk ` +
            'is INCOMPLETE, so the NF-005 assertions below are not being proven — fix the ' +
            'resolution rather than accepting a partial closure.',
        )
      }
      queue.push(repoPath(hit))
    }
  }

  return { closure, violations }
}

/** The repo-real transitive closure of the worker entry. */
function workerClosure(): { closure: string[]; violations: Array<{ from: string; specifier: string }> } {
  return walkClosure(WORKER_ENTRY)
}

describe('NF-005 / FR-H3 — the worker entry\'s transitive closure reaches no package', () => {
  it('walks a non-trivial closure (non-vacuous: the walker must actually traverse)', () => {
    // Without this, a walker bug returning an empty closure would satisfy every
    // "no external import" assertion below while checking nothing. The
    // expectations are LITERALS, never counts read from the walk: a threshold
    // derived from the walk it is meant to police cannot fail.
    const { closure } = workerClosure()
    expect(closure).toContain('src/lib/export-site-pages.ts')
    expect(closure).toContain('src/lib/page-path.ts')
    // The H3 half specifically: the module the old list-based guard could not see.
    expect(closure).toContain('src/lib/export-html.ts')
    expect(closure.length).toBeGreaterThan(10)
  })

  it('the closure carries NO bare specifier anywhere', () => {
    expect(workerClosure().violations).toEqual([])
  })

  it('the closure never reaches an editor component or a store', () => {
    // Implied by the assertion above, but the SPECIFIC claim ("no editor, no
    // stores, no React") is the one a maintainer reads, and the two failures
    // should read differently: a bare `immer` leak is a real NF-005 break but
    // is not a React-family leak.
    const offenders = workerClosure().closure.filter(
      (file) => file.startsWith('src/components/') || file.startsWith('src/store/'),
    )
    expect(offenders).toEqual([])
  })

  it('the worker entry re-exports ONLY the six worker-facing names', () => {
    // AC-04: the barrel keeps its own surface; this entry must not quietly grow.
    // Named literally rather than counting export statements.
    const source = readRepoFile(WORKER_ENTRY)
    expect(closureImportSpecifiers(source).sort()).toEqual([
      './export-html',
      './export-site-pages',
      './page-path',
      '@/blocks/types',
    ])

    // The name checks read COMMENT-STRIPPED source, not the raw file. This
    // module's own doc comment explains WHY it deliberately omits
    // `EditorLayout`/`useConfigStore`, so a raw-text check would fail on its
    // documentation — the general lesson being that a
    // tripwire that its subject's own comments trip is a
    // tripwire that gets deleted rather than fixed.
    const code = stripComments(source)

    // FR-D2: the two types in the renderer's signature ride along with the four
    // functions/types it exports. `validateSiteConfig` is deliberately NOT here
    // (see the absence list below).
    for (const name of [
      'exportSitePages',
      'PageDocument',
      'normalizePagePaths',
      'isValidPagePath',
      'SiteConfig',
      'ExportSiteOptions',
    ]) {
      expect(code, `${name} is not re-exported by the worker entry`).toContain(name)
    }
    for (const name of [
      'slugifyPagePath',
      'EditorLayout',
      'CanvasToolbar',
      'useConfigStore',
      'useEditorStore',
      'renderDocument',
      // FR-F1: a lossy AI-output sanitizer that drags the generation client
      // into the worker closure; removing a permanent export later is breaking.
      'validateSiteConfig',
      'generate-site',
    ]) {
      expect(code, `${name} leaked into the worker entry`).not.toContain(name)
    }
  })

  it('the walker DETECTS a component import reached through the `@/` alias (H3 shape)', () => {
    // A guard that cannot fail is not a guard. This runs against a SYNTHETIC
    // module map so it proves the walk detects the leak on EVERY suite pass
    // instead of only during review — and it is the exact H3 scenario: an
    // `@/components/...` import, which the old flat `ATOM_MODULES` scan could
    // not see at all. The component module is present in the map, so the walk
    // genuinely traverses INTO it and the component-path assertion below (which
    // is a separate, literal check) is the one that fires.
    const { closure } = walkClosure('canary-root.ts', {
      'canary-root.ts': "export { EditorLayout } from '@/components/EditorLayout'",
      'src/components/EditorLayout.tsx': "import { thing } from 'react'\nexport const EditorLayout = thing",
    })
    expect(closure).toContain('src/components/EditorLayout.tsx')
    // ...and the violation inside it IS reported, tagged with its own file.
    expect(walkClosure('canary-root.ts', {
      'canary-root.ts': "export { EditorLayout } from '@/components/EditorLayout'",
      'src/components/EditorLayout.tsx': "import { thing } from 'react'\nexport const EditorLayout = thing",
    }).violations).toEqual([{ from: 'src/components/EditorLayout.tsx', specifier: 'react' }])
  })

  it('the walker DETECTS an external import two hops deep, not just at the root', () => {
    // The H3 shape exactly: the root is clean, the leak is in a transitive
    // module — which is precisely what the flat `ATOM_MODULES` scan could not see.
    const violations = walkClosure('canary-root.ts', {
      'canary-root.ts': "export * from './hop2'\nexport const root = 1",
      'hop2.ts': "import { store } from 'zustand'\nexport * from './hop3'",
      'hop3.ts': 'export const store = 1',
    }).violations
    expect(violations).toEqual([{ from: 'hop2.ts', specifier: 'zustand' }])
  })

  it('the walker DETECTS an external import at the ROOT with no target module', () => {
    // A bare specifier needs no target file to be detected, so this canary is
    // one line and needs nothing in the map: the leak is reported from the root.
    const violations = walkClosure('canary-root.ts', {
      'canary-root.ts': "import { thing } from 'react'\nexport const c = thing",
    }).violations
    expect(violations).toEqual([{ from: 'canary-root.ts', specifier: 'react' }])
  })

  it('PROSE that names a package is not an import (comments are stripped first)', () => {
    // Regression guard for a defect this walker actually shipped with on its
    // first run: `worker-entry.ts` documents the subpath as
    // "reachable as `@siteable/core/worker`", and the pre-comment-stripping
    // scanner reported `@siteable/core` as a bare import of the worker entry —
    // a FALSE POSITIVE created entirely by documentation. If comment stripping
    // is ever removed, this fails instead of the real closure assertions
    // failing for a reason nobody can find.
    const { violations } = walkClosure('canary-root.ts', {
      'canary-root.ts': [
        '// import { thing } from "react"',
        '/* import { other } from "zustand" */',
        "export const c = 1",
      ].join('\n'),
    })
    expect(violations).toEqual([])
  })

  it('the walker DETECTS the unspaced form the publish-fidelity scanner misses', () => {
    // `import{a}from'react'` is deliberately uncaught by
    // `importSpecifiers`. For the worker closure that gap is unacceptable, so
    // this pins the WIDENED scanner's advantage over the old one explicitly.
    const source = "import{useConfigStore}from'zustand'"
    expect(closureImportSpecifiers(source)).toEqual(['zustand'])
  })

  it('an UNRESOLVABLE import fails loudly rather than silently shortening the walk', () => {
    // The failure mode that would make this whole file a no-op: a walker that
    // gives up quietly on an import it cannot resolve reports a short, clean
    // closure and every assertion above passes.
    expect(() =>
      walkClosure('canary-root.ts', {
        'canary-root.ts': "export * from './does-not-exist'",
      }),
    ).toThrow(/could not resolve/)
  })
})
// ---------------------------------------------------------------------------
// FR-C1 / NF-005 — the BUILT artifact (T306).
// ---------------------------------------------------------------------------
//
// This is the ONLY assertion in the repo that can prove C1. Everything above
// reasons about SOURCE: that the worker entry names four symbols, and that no
// module it reaches imports a bare package. None of that shows up in the
// artifact a consumer actually loads — and the whole C1 finding was that the
// source and the barrel were fine while `dist/index.js` carried top-level React
// imports. A source-level test cannot see bundler behaviour: chunk splitting,
// tree-shaking, and external-vs-bundled resolution all happen after the source
// is gone. C1 is exactly a case where "the source looks right" was true and the
// shipped bundle was still wrong.
//
// So this asserts on the REAL worker artifact and its TRANSITIVE relative-import
// closure. That entry file is only a ~150-byte re-export shim — the actual body
// is split into a hashed chunk — so checking the entry file ALONE would be a
// vacuous pass. The closure walk below is what makes it real.
//
// CI runs `npm test` in a job with NO build output (build is a separate
// required check), so a missing artifact cannot simply be skipped: it would make
// this assertion silently inert in the one environment where nobody is watching.
// The test BUILDS when the artifact is absent or older than any source file, then
// asserts. A build failure fails the test — that is the intended signal, since
// "cannot build" and "builds a React-bearing worker entry" are the same defect.

const OUTPUT_DIR = resolve(REPO_ROOT, 'dist')
const WORKER_ARTIFACT = resolve(OUTPUT_DIR, 'worker.js')
const BARREL_ARTIFACT = resolve(OUTPUT_DIR, 'index.js')

/** Packages that would defeat the point of a worker entry in a Cloudflare Worker. */
const REACT_FAMILY = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'zustand',
  'immer',
  '@dnd-kit/core',
  '@dnd-kit/sortable',
  '@dnd-kit/utilities',
  'sonner',
  'lucide-react',
]

/** Every `from "…"` / `import("…")` / `require("…")` specifier in a BUILT file. */
function builtImportSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
    ...source.matchAll(/\bimport\s*["']([^"']+)["']/g),
    ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
  ].map((match) => match[1])
}

/**
 * Every `.js` file in the output directory reachable from `entry` through
 * RELATIVE imports, plus every bare specifier encountered on the way.
 *
 * Relative specifiers ARE followed — Rollup splits shared code into a hashed
 * chunk that the tiny entry re-exports, so following them is the whole point.
 * Bare specifiers are recorded rather than followed (they are external by
 * definition; resolving them would need a node_modules graph the assertion does
 * not care about).
 */
function builtClosure(entry: string): {
  files: string[]
  bare: Array<{ from: string; specifier: string }>
} {
  const files: string[] = []
  const bare: Array<{ from: string; specifier: string }> = []
  const seen = new Set<string>()
  const queue = [entry]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current)) continue
    seen.add(current)
    files.push(current)

    for (const specifier of builtImportSpecifiers(readFileSync(current, 'utf8'))) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(current), specifier))
        continue
      }
      // Absolute paths and node builtins are not packages.
      if (specifier.startsWith('/') || specifier.startsWith('node:')) continue
      bare.push({ from: relative(OUTPUT_DIR, current), specifier })
    }
  }
  return { files, bare }
}

/** Repo-relative display name for a built file, for readable failure messages. */
function artifactName(file: string): string {
  return `dist/${relative(OUTPUT_DIR, file)}`
}

/** An `exports` entry, which the manifest allows in object or string shorthand. */
type ExportsEntry = { types?: string; import?: string }

/** The `import` target of an `exports` entry, in either supported form. */
function exportsImport(entry: ExportsEntry | string | undefined): string | undefined {
  if (typeof entry === 'string') return entry
  return entry?.import
}

/** The `default` target of an `exports` entry (object form only). */
function exportsDefault(entry: (ExportsEntry & { default?: string }) | string | undefined): string | undefined {
  return typeof entry === 'string' ? undefined : entry?.default
}

/** The `types` target of an `exports` entry, in either supported form. */
function exportsTypes(entry: ExportsEntry | string | undefined): string | undefined {
  if (typeof entry === 'string') return undefined
  return entry?.types
}

describe('FR-C1 — the built-artifact guard rebuilds when it must', () => {
  it('an artifact OLDER than an input is stale (the branch M1c showed untested)', () => {
    expect(isArtifactStale(100, 200)).toBe(true)
  })

  it('an artifact NEWER than every input is current', () => {
    expect(isArtifactStale(300, 200)).toBe(false)
  })

  it('a missing artifact (mtime 0) is always stale', () => {
    expect(isArtifactStale(0, 1)).toBe(true)
  })

  it('equal mtimes are not stale (strict `<`, so a `<=` "fix" does not rebuild every run)', () => {
    expect(isArtifactStale(200, 200)).toBe(false)
  })
})

describe('stripComments - a `//` inside a string must not hide a real import', () => {
  it('still reports a bare import that shares a line with a URL string', () => {
    // vk-tester's M4: dropping the colon/quote guard in the line-comment regex
    // survived the suite because no test put `//` in a string beside a real
    // import. Over-stripping hides the import, which is the one direction that
    // matters for NF-005.
    expect(closureImportSpecifiers('const u = "http://a"; import x from \'react\'')).toEqual(['react'])
  })
})

describe('FR-C1 / NF-005 — the BUILT worker artifact imports no React-family package', () => {
  // One build for the whole block (`beforeAll`, not a per-test build), and only
  // when needed — see `ensureFreshBuild`.
  let buildState = 'not run'
  beforeAll(() => {
    buildState = ensureFreshBuild()
  }, 300_000)

  it('emits both entries and both declaration files (FR-C1b, AC-01)', () => {
    for (const file of ['worker.js', 'index.js', 'worker.d.ts', 'index.d.ts']) {
      expect(
        existsSync(resolve(OUTPUT_DIR, file)),
        `dist/${file} was not emitted (${buildState})`,
      ).toBe(true)
    }
  })

  it('the worker entry and its whole relative-import closure carry NO bare specifier', () => {
    const { files, bare } = builtClosure(WORKER_ARTIFACT)
    expect(bare, `${buildState}; files walked: ${files.map(artifactName).join(', ')}`).toEqual([])
    // Non-vacuity: the walk must have read a real body, not just the ~150-byte
    // shim. Named floors, not values read from the walk itself.
    expect(files.length).toBeGreaterThan(1)
    const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0)
    expect(totalBytes).toBeGreaterThan(10_000)
  })

  it('FR-D2 — the BUILT worker exposes exactly the three runtime names and the three type names', async () => {
    // Runtime half: import the real artifact. It is bare-specifier-free (asserted
    // above), so it loads without React present, which is the whole point.
    const mod = await import(pathToFileURL(WORKER_ARTIFACT).href)
    expect(Object.keys(mod).sort()).toEqual([
      'exportSitePages',
      'isValidPagePath',
      'normalizePagePaths',
    ])
    // Type half: erased at runtime, so read the declaration file instead.
    const dts = readFileSync(resolve(OUTPUT_DIR, 'worker.d.ts'), 'utf8')
    for (const name of ['PageDocument', 'SiteConfig', 'ExportSiteOptions']) {
      // Must be an EXPORTED declaration - merely being referenced by another
      // signature (declared locally, not exported) must not satisfy this.
      expect(dts, `${name} not exported from dist/worker.d.ts`).toMatch(
        new RegExp(`export\\s+declare\\s+(?:interface|type)\\s+${name}\\b`),
      )
    }
  })

  it('names no React-family specifier anywhere in the worker closure', () => {
    // Subsumed by the closure-wide assertion above, but stated as the SPECIFIC
    // claim: this is the sentence the phase exists to make true, and a reader
    // should not have to reason about the general rule to find it.
    const found: Array<{ file: string; name: string }> = []
    for (const file of builtClosure(WORKER_ARTIFACT).files) {
      for (const specifier of builtImportSpecifiers(readFileSync(file, 'utf8'))) {
        const name = REACT_FAMILY.find((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))
        if (name) found.push({ file: artifactName(file), name })
      }
    }
    expect(found).toEqual([])
  })

  it('the BARREL artifact still carries React — the positive control (guard has teeth)', () => {
    // Without this, "no React in the worker closure" is equally consistent with
    // "the scanner cannot detect a React import anywhere". The barrel is the
    // control: same file shape, same build, and it DOES import react — so the
    // worker assertion above is discriminating rather than blind. The
    // tripwire must name its subject independently of the thing it inspects.
    const specifiers = builtImportSpecifiers(readFileSync(BARREL_ARTIFACT, 'utf8'))
    const found = REACT_FAMILY.filter((pkg) =>
      specifiers.some((specifier) => specifier === pkg || specifier.startsWith(`${pkg}/`)),
    )
    expect(
      found.length,
      'no React-family import found in dist/index.js either — the scanner may be blind',
    ).toBeGreaterThan(0)
    expect(found).toContain('react')
  })

  it('FR-C1b — the barrel keeps its React surface while the worker entry does not', () => {
    // The two halves of C1 together: `.` must keep working EXACTLY as before
    // (same React imports, same component surface) and `./worker` must be free
    // of them. If a future build change made the worker entry re-export from the
    // barrel's chunk, the worker would silently inherit React and only the
    // first assertion would notice — this one states the contrast directly.
    expect(builtClosure(BARREL_ARTIFACT).bare.length).toBeGreaterThan(0)
    expect(builtClosure(WORKER_ARTIFACT).bare).toEqual([])
  })

  it('the barrel artifact still exports its full name set (FR-C1b, artifact half)', () => {
    // An earlier review noted: the React-surface assertion above proves the barrel kept
    // its IMPORTS, but nothing proved it kept its EXPORTS. A two-entry build
    // change could drop a barrel export and every source-level test would stay
    // green, because they all import `src/index.ts` directly rather than the
    // built artifact. Asserting the name SET against a literal catches a build
    // that silently narrows the published surface.
    //
    // Read off the built file's `export { … }` tail rather than by importing it:
    // importing `dist/index.js` would evaluate the barrel's module-scope
    // zustand singletons and require React to be resolvable, which is exactly
    // what this package does not guarantee in a test environment.
    const source = readFileSync(BARREL_ARTIFACT, 'utf8')
    const exported = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap((match) => match[1].split(','))
      .map((name) => name.trim().split(/\s+as\s+/).pop()!)
      .filter(Boolean)

    // A spot-check of names a consumer is documented to rely on, NOT an
    // exhaustive allow-list: the barrel has ~66 exports and freezing all of them
    // here would make every future addition a test edit. These are the ones the
    // README and consuming apps name.
    for (const name of [
      'EditorLayout',
      'CanvasToolbar',
      'useConfigStore',
      'useEditorStore',
      'exportSiteToHTML',
      'exportSitePages',
      'normalizePagePaths',
      'isValidPagePath',
      'validateSiteConfig',
      'generateSiteConfig',
      'themePresets',
      'defaultConfig',
      'isAllowedUrl',
    ]) {
      expect(exported, `dist/index.js no longer exports ${name}`).toContain(name)
    }

    // `slugifyPagePath` must stay internal, and
    // in the BUILT artifact rather than only at source level.
    expect(exported).not.toContain('slugifyPagePath')
  })

  it('package.json routes both subpaths at files that exist, and declares no side effects', () => {
    // AC-01 / D2 at the MANIFEST level: an `exports` map pointing at a file the
    // build does not emit is a broken consumer contract that no runtime
    // assertion in this repo would catch.
    const manifest = JSON.parse(readRepoFile('package.json')) as {
      exports: Record<string, ExportsEntry | string>
      sideEffects?: boolean | string[]
      main: string
      module: string
      types: string
    }

    // Narrowed via a helper rather than an inline cast, so a subpath that was
    // switched to the string shorthand (`"./worker": "./dist/worker.js"`) fails
    // with a readable message instead of a TypeScript property error.
    expect(exportsImport(manifest.exports['.'])).toBe('./dist/index.js')
    expect(exportsImport(manifest.exports['./worker'])).toBe('./dist/worker.js')
    expect(exportsTypes(manifest.exports['.'])).toBe('./dist/index.d.ts')
    expect(exportsTypes(manifest.exports['./worker'])).toBe('./dist/worker.d.ts')

    for (const [subpath, target] of Object.entries(manifest.exports)) {
      const file = exportsImport(target)
      if (!file) continue
      // `./package.json` and `./src/styles.css` are literal source files, not
      // built ones; the CSS one is existence-checked separately below.
      if (subpath === './package.json' || subpath === './src/styles.css') continue
      expect(existsSync(resolve(REPO_ROOT, file)), `exports["${subpath}"] -> ${file} does not exist`).toBe(true)
    }

    expect(existsSync(resolve(REPO_ROOT, 'src/styles.css')), 'exports["./src/styles.css"] target missing').toBe(true)

    // D2: without this, a consumer's bundler cannot drop the zustand
    // module-scope singletons when only the export API is imported — which is
    // half of C1.
    //
    // NOT `false`. `false` would let a consumer's bundler drop a
    // JS-side `import '@siteable/core/src/styles.css'` as dead code. Only CSS is
    // declared effectful, so the JS tree-shaking this guard exists for is unchanged.
    expect(manifest.sideEffects).toEqual(['**/*.css'])

    // FR-C1b: legacy resolvers ignore `exports` and must still land on the file
    // the barrel has always used.
    expect(manifest.main).toBe('./dist/index.js')
    expect(manifest.module).toBe('./dist/index.js')
    expect(manifest.types).toBe('./dist/index.d.ts')

    // The `exports` map is wider than `.` and `./worker` alone. Both additions are load-bearing and pinned BY VALUE, so a
    // later cleanup cannot remove them silently (deleting either once
    // survived the whole suite).
    //
    // `./src/styles.css` - justified by the README's documented Tailwind setup,
    // `@import "@siteable/core/src/styles.css"`. NOT by consuming apps
    // that reach it through a relative path under their own installed-packages
    // directory, which the map never sees. It was narrowed from a `./src/*` glob, which published every TS source file
    // and would resolve its `@/` imports against a consumer's own alias;
    // widening later is non-breaking, narrowing is not.
    expect(manifest.exports['./src/styles.css']).toBe('./src/styles.css')
    expect(manifest.exports['./package.json']).toBe('./package.json')
    // The map is EXACTLY these four subpaths - no glob can quietly come back.
    expect(Object.keys(manifest.exports).sort()).toEqual([
      '.',
      './package.json',
      './src/styles.css',
      './worker',
    ])

    // `default` - an `import`-only map has no CJS fallback, so
    // `require.resolve('@siteable/core')` threw ERR_PACKAGE_PATH_NOT_EXPORTED
    // from an installed tarball.
    expect(exportsDefault(manifest.exports['.'])).toBe('./dist/index.js')
    expect(exportsDefault(manifest.exports['./worker'])).toBe('./dist/worker.js')
  })
})