/**
 * Structural guard for ISS-005 — the whole bug CLASS, not just the instance.
 *
 * `BannerBlock` rendered an ungated `<a href>` while its three siblings gated
 * theirs. Nothing failed: no test asserted the invariant, so review caught it by
 * luck. This makes the invariant mechanical — any component under `src/blocks`
 * that renders an anchor must reference the shared URL policy.
 *
 * The check is deliberately coarse (it asserts the policy is *referenced*, not
 * that it guards the specific href). A precise data-flow assertion is not
 * expressible at this level, and a coarse guard that fails loudly on a real
 * omission is worth more than none. If a component ever renders an anchor that
 * genuinely needs no policy check, add it to ALLOWED with the reason — do not
 * widen the regex.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const BLOCKS_DIR = join(ROOT, 'src', 'blocks')

/** Files permitted to render `<a href>` without the policy helper. */
const ALLOWED = new Set<string>([
  // (empty — every current anchor is policy-gated)
])

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

describe('src/blocks anchors are URL-policy gated (ISS-005 class guard)', () => {
  it('every component rendering <a ... href= references isAllowedUrl', () => {
    const offenders = walk(BLOCKS_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => {
        const src = readFileSync(f, 'utf8')
        if (!/<a\s[^>]*href=/s.test(src)) return false
        if (/isAllowedUrl/.test(src)) return false
        return !ALLOWED.has(relative(ROOT, f))
      })
      .map((f) => relative(ROOT, f))

    expect(offenders).toEqual([])
  })

  it('finds anchors to check (guards against the matcher silently matching nothing)', () => {
    const filesWithAnchors = walk(BLOCKS_DIR)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /<a\s[^>]*href=/s.test(readFileSync(f, 'utf8')))

    expect(filesWithAnchors.length).toBeGreaterThan(0)
  })
})
