/**
 * SC-002 — the exact table-driven allowed/denied set for the shared URL policy,
 * plus the `{ image: true }` narrowing and the NF-001 linearity assertion.
 *
 * Spec: `specs/publish-fidelity/spec.md` FR-004 / SC-002, NF-001, NF-006.
 * Module: `src/lib/url-policy.ts`.
 */
import { describe, it, expect } from 'vitest'
import { isAllowedUrl } from '../src/lib/url-policy'

/** SC-002 allowed set — verbatim from the spec. */
const ALLOWED = ['https://x', 'http://x', 'mailto:a@b', 'tel:+1', '/p', './p', '../p', 'p', '#a']

/** SC-002 denied set — verbatim from the spec. */
const DENIED = [
  'javascript:',
  'JaVaScRiPt:',
  ' javascript:',
  '\tjavascript:',
  'java\tscript:',
  'data:text/html,x',
  'vbscript:',
  '//evil.example',
  '&#106;avascript:',
]

describe('isAllowedUrl — SC-002 allowed set', () => {
  it.each(ALLOWED)('accepts %j', (value) => {
    expect(isAllowedUrl(value)).toBe(true)
  })
})

describe('isAllowedUrl — SC-002 denied set', () => {
  it.each(DENIED)('rejects %j', (value) => {
    expect(isAllowedUrl(value)).toBe(false)
  })
})

describe('isAllowedUrl — structural deny rules', () => {
  it('rejects empty and whitespace-only values', () => {
    expect(isAllowedUrl('')).toBe(false)
    expect(isAllowedUrl('   ')).toBe(false)
    expect(isAllowedUrl('\n')).toBe(false)
  })

  it('rejects any value containing a control character', () => {
    expect(isAllowedUrl('https://x\u0000')).toBe(false)
    expect(isAllowedUrl('https://x\u007f')).toBe(false)
    expect(isAllowedUrl('ht\u0009tps://x')).toBe(false)
    expect(isAllowedUrl('https://x\n')).toBe(false)
    expect(isAllowedUrl('https://x\r')).toBe(false)
    expect(isAllowedUrl('https://x\u001f')).toBe(false)
  })

  it('rejects an entity-obfuscated scheme via the first-segment guard (D3)', () => {
    // No valid scheme is parsed (`#` terminates the scan), so this is rejected
    // by the `&`/quote/backslash rule on the leading segment rather than by the
    // scheme allow-list. Pinned as an explicit case so the two paths cannot
    // silently trade places.
    expect(isAllowedUrl('&#106;avascript:alert(1)')).toBe(false)
    expect(isAllowedUrl('&')).toBe(false)
  })

  it('rejects quote and backslash characters in the first path segment', () => {
    expect(isAllowedUrl('a"onerror="x')).toBe(false)
    expect(isAllowedUrl("a'onerror='x")).toBe(false)
    expect(isAllowedUrl('a\\b')).toBe(false)
    expect(isAllowedUrl('<script>')).toBe(false)
  })

  it('accepts a space inside a relative path', () => {
    // The phase-01 plan originally listed "a space run" as a first-segment deny
    // character. That clause was dropped during calibrate Stage 2: a space is
    // legal in a URL path (`/my page.html`, `foo bar`) and a browser
    // percent-encodes it on navigation. The rule rejects only
    // `& < > " ' \` — the characters that actually matter for injection. Pinned
    // here so the behavior is deliberate rather than accidental, and so the
    // stale plan clause cannot silently come back.
    expect(isAllowedUrl('foo bar')).toBe(true)
    expect(isAllowedUrl('/my page.html')).toBe(true)
    // A whitespace-only value is still rejected — deny reason 1 catches it
    // before the segment guard is ever reached.
    expect(isAllowedUrl('   ')).toBe(false)
  })

  it('treats a colon-bearing relative value as a scheme and rejects it', () => {
    // Not a relative path — `foo` parses as a scheme that is not in the list.
    expect(isAllowedUrl('foo:bar')).toBe(false)
  })

  it('accepts a colon that appears after a path separator as a path character', () => {
    expect(isAllowedUrl('/a:b')).toBe(true)
    expect(isAllowedUrl('#a:b')).toBe(true)
    expect(isAllowedUrl('?a:b')).toBe(true)
  })

  it('rejects protocol-relative values with leading whitespace', () => {
    expect(isAllowedUrl('  //evil.example')).toBe(false)
  })

  it('rejects the backslash origin-escape spellings (REVIEW2 critical)', () => {
    // `new URL(v, 'https://base.example/')` resolves each of these to
    // https://evil.example/ — browsers fold `\` to `/` in the authority
    // position, and `escapeHtml` cannot help because backslash needs no
    // escaping. The policy is the only defense, so it must reject all of them.
    expect(isAllowedUrl('/\\evil.example')).toBe(false)
    expect(isAllowedUrl('/\\/evil.example')).toBe(false)
    expect(isAllowedUrl('https:/\\evil.example')).toBe(false)
    expect(isAllowedUrl('\\evil.example')).toBe(false)
    expect(isAllowedUrl('https:\\\\evil.example')).toBe(false)
    // Rejecting a backslash anywhere is stricter than the authority-position
    // case, and is the intended rule: a backslash is never legitimate here.
    expect(isAllowedUrl('/a/b\\c')).toBe(false)
    expect(isAllowedUrl('https://x/a\\b', { image: true })).toBe(false)
  })

  it('rejects non-string values defensively', () => {
    // The config reaches this module straight from parsed JSON / a siteconfig
    // import, so an untyped runtime value is reachable in practice. The `typeof`
    // guard in the implementation exists precisely for that boundary.
    expect(isAllowedUrl(undefined as unknown as string)).toBe(false)
    expect(isAllowedUrl(null as unknown as string)).toBe(false)
    expect(isAllowedUrl(42 as unknown as string)).toBe(false)
  })
})

describe('isAllowedUrl — image narrowing (FR-004)', () => {
  it('accepts only absolute https: image sources', () => {
    expect(isAllowedUrl('https://cdn.example.com/a.png', { image: true })).toBe(true)
  })

  it('rejects every non-https image source', () => {
    expect(isAllowedUrl('http://cdn.example.com/a.png', { image: true })).toBe(false)
    expect(isAllowedUrl('/p.png', { image: true })).toBe(false)
    expect(isAllowedUrl('./p.png', { image: true })).toBe(false)
    expect(isAllowedUrl('data:image/png;base64,AAAA', { image: true })).toBe(false)
    expect(isAllowedUrl('//evil.example/a.png', { image: true })).toBe(false)
  })
})

describe('isAllowedUrl — NF-001 linearity', () => {
  it('resolves a 2 KB hostile input in well under 5 ms', () => {
    // Must reach the FULL scan, not an early exit. The previous payload was
    // `javascript:` + control chars, which deny reason 2 rejected at index 11 —
    // so it measured a 12-character prefix, not a 2 KB walk. Payload 1 below
    // carries no `/ ? # :` at all, so `readScheme` walks all 2044 chars before
    // concluding there is no scheme, and the segment guard then walks all 2044
    // again: the two longest walks in the implementation, on one input.
    // Payload 2 has a valid scheme, so the allow-list passes and the ~2 KB
    // opaque part is walked by the control-char loop instead. Both are the
    // shape that makes a backtracking regex blow up while a char-code loop stays
    // O(n).
    const hostile = ['a'.repeat(2044), `https://x/${'a'.repeat(2000)}`]
    for (const value of hostile) expect(value.length).toBeGreaterThan(2000)

    const started = performance.now()
    for (const value of hostile) {
      for (let i = 0; i < 100; i += 1) isAllowedUrl(value)
    }
    const perCall = (performance.now() - started) / (hostile.length * 100)

    expect(perCall).toBeLessThan(5)
  })

  it('resolves a 2 KB benign input in well under 5 ms', () => {
    const benign = `https://example.com/${'segment/'.repeat(260)}`
    expect(benign.length).toBeGreaterThan(2000)

    const started = performance.now()
    for (let i = 0; i < 100; i += 1) isAllowedUrl(benign)
    const perCall = (performance.now() - started) / 100

    expect(perCall).toBeLessThan(5)
  })

  // ── Phase-07 strengthening ────────────────────────────────────────────────
  // Phase 01 proved NF-001 with a fixed absolute threshold on a 2 KB call. That
  // distinguishes "fast on this box" from "slow on this box" — it does NOT
  // distinguish O(n) from O(n²): a quadratic policy on a 2 KB input still
  // returns in well under 5 ms. (The accepted phase-01 gap U1 recorded exactly
  // this: linearity was shown by wall-clock timing, not an observable work
  // count.) A production walk-counter would close it only by adding an API that
  // exists solely for test observability — rejected as worse than the gap. The
  // tests below instead pin the COMPLEXITY CLASS directly, by measuring how the
  // cost grows with input length. That needs no production surface and is
  // machine-speed-independent.

  /** Best (min) per-call cost over `rounds` batches of `iterations` calls. */
  function bestPerCall(value: string, iterations: number, rounds: number): number {
    let best = Infinity
    for (let r = 0; r < rounds; r += 1) {
      const start = performance.now()
      for (let i = 0; i < iterations; i += 1) isAllowedUrl(value)
      best = Math.min(best, (performance.now() - start) / iterations)
    }
    return best
  }

  it('scales linearly (not quadratically) with input length', () => {
    // Both inputs force a FULL scan: no `:` so `readScheme` walks every char,
    // then the segment guard walks them again (the two longest walks in the
    // implementation). Growing 2 KB → 200 KB is a 100x size increase; a linear
    // policy grows ~100x, a quadratic one (or a backtracking regex) grows
    // ~10,000x. min-of-5 rounds removes scheduler-noise spikes from both sides.
    const small = 'a'.repeat(2_000)
    const large = 'a'.repeat(200_000)
    expect(isAllowedUrl(small)).toBe(true)
    expect(isAllowedUrl(large)).toBe(true)

    const perSmall = bestPerCall(small, 2_000, 5)
    const perLarge = bestPerCall(large, 40, 5)
    const ratio = perLarge / perSmall

    // 400x sits far above the ~100x a linear policy produces and far below the
    // ~10,000x a quadratic/backtracking one produces, so it cannot false-pass a
    // quadratic/backtracking regression nor false-fail on ordinary timing noise.
    // It does NOT discriminate mild super-linear growth (e.g. n log n ≈ 130x) —
    // that slack is deliberate; NF-001 targets catastrophic backtracking only.
    expect(
      ratio,
      `2 KB → ${perSmall.toFixed(5)} ms/call, 200 KB → ${perLarge.toFixed(5)} ms/call ` +
        `(ratio ${ratio.toFixed(1)}x for a 100x size increase). A linear policy grows ` +
        '~100x; failing this means super-linear (backtracking/quadratic) behavior.'
    ).toBeLessThan(400)
  })

  it('returns correct verdicts on multi-megabyte inputs (full-scan correctness)', () => {
    // The observable half of the complexity claim: a genuine O(n) policy walks a
    // multi-MB input end-to-end and still classifies correctly. A regressed one
    // either hangs or early-exits to the wrong verdict.
    expect(isAllowedUrl('a'.repeat(1_000_000))).toBe(true)
    expect(isAllowedUrl('/' + 'path/'.repeat(250_000))).toBe(true)
    // A denied scheme is rejected at the `:` regardless of how much tail follows.
    expect(isAllowedUrl('javascript:' + 'a'.repeat(1_000_000))).toBe(false)
    // A control character anywhere poisons the value, even 1 MB in.
    expect(isAllowedUrl('/p/' + 'a'.repeat(1_000_000) + '\u0007')).toBe(false)
  })
})
