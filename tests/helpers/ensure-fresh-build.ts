/**
 * Shared "build the package when the artifact is missing or stale" helper for
 * tests that assert against the BUILT package output (the worker entry).
 *
 * Extracted from `export-runtime-deps.test.ts` so the node-environment worker
 * import gate reuses the exact same rule instead of re-implementing it. CI runs
 * `npm test` in a job with no build output, so a built-artifact test that merely
 * skipped when the artifact was absent would be silently inert there.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const OUTPUT_DIR = resolve(REPO_ROOT, 'dist')
const WORKER_ARTIFACT = resolve(OUTPUT_DIR, 'worker.js')
const BARREL_ARTIFACT = resolve(OUTPUT_DIR, 'index.js')

/** Every `.ts`/`.tsx` file under `dir`, recursively. */
function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

/**
 * Build the package when the artifact is missing or stale relative to source.
 *
 * Returns WHY it built, so a failure message can say "rebuilt" rather than
 * silently reporting against a stale artifact from an earlier build. Skipped
 * entirely when the artifact is newer than every source file, so a developer
 * with a current build pays nothing and CI pays exactly one build.
 */
export function ensureFreshBuild(): string {
  const state = artifactState()
  if (!state.stale) return 'current'

  // Vitest runs test FILES in parallel workers and two files now need the
  // artifact. Two simultaneous `vite build`s empty and rewrite the same output
  // directory and fail each other (reproduced 3/3 on a cold tree,
  // which is exactly the CI condition). An atomic `mkdir` lock serializes them;
  // staleness is re-checked after acquiring it, so the loser finds the winner's
  // fresh artifact and builds nothing, which keeps CI at exactly one build.
  const lockDir = resolve(tmpdir(), `siteable-core-build-${createHash('sha1').update(REPO_ROOT).digest('hex').slice(0, 12)}.lock`)
  const deadline = Date.now() + 280_000
  for (;;) {
    try {
      mkdirSync(lockDir)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // A crashed holder must not wedge every later run.
      if (Date.now() - statSync(lockDir).mtimeMs > 240_000) rmSync(lockDir, { recursive: true, force: true })
      if (Date.now() > deadline) throw new Error(`timed out waiting for the build lock ${lockDir}`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
    }
  }
  try {
    const recheck = artifactState()
    if (!recheck.stale) return 'current (built by a concurrent test file)'
    execFileSync('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'pipe' })
    return recheck.missing ? 'built (artifact was missing)' : 'built (artifact was stale)'
  } finally {
    rmSync(lockDir, { recursive: true, force: true })
  }
}

/** Whether the artifact is missing or older than any build input, right now. */
function artifactState(): { stale: boolean; missing: boolean } {
  const inputs = [
    ...collectSourceFiles(resolve(REPO_ROOT, 'src')),
    // The build is also a function of these two, so editing either must
    // invalidate the artifact (an mtime check over src/** alone left a
    // stale artifact after a vite.config.ts or package.json edit).
    resolve(REPO_ROOT, 'vite.config.ts'),
    resolve(REPO_ROOT, 'package.json'),
  ]
  const newestInput = Math.max(...inputs.map((file) => statSync(file).mtimeMs))

  const missing = !existsSync(WORKER_ARTIFACT) || !existsSync(BARREL_ARTIFACT)
  const oldestArtifact = missing
    ? 0
    : Math.min(statSync(WORKER_ARTIFACT).mtimeMs, statSync(BARREL_ARTIFACT).mtimeMs)
  return { stale: isArtifactStale(oldestArtifact, newestInput), missing }
}

/**
 * The staleness decision, pulled out so it can be tested WITHOUT a build.
 * vk-tester's M1c showed that forcing `ensureFreshBuild` to always report
 * "current" survived the suite whenever an artifact already existed: the
 * missing-artifact branch was covered, the STALE branch was not.
 */
export function isArtifactStale(oldestArtifactMs: number, newestInputMs: number): boolean {
  return oldestArtifactMs < newestInputMs
}
