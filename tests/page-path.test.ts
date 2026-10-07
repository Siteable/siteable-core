/**
 * SC-003 / NF-002 — page-path normalization and the raw-path shape predicate.
 *
 * Requirements: FR-002, NF-002, SC-003. The normalizer is the single place that decides a page's published
 * URL, so its edge cases are pinned as a literal expected table rather than
 * re-derived: a "reasonable-looking" different answer here silently republishes
 * a customer's site at different URLs.
 *
 * The two degradation families below are deliberate, spec-literal behavior, not
 * bugs — non-ASCII is stripped rather than transliterated, so a Vietnamese path
 * degrades (`/giới-thiệu` → `/gi-i-thi-u`) and a CJK-only path collapses to `/`
 * and is then demoted to `/page-2`. Diacritic folding would need an RFC.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizePagePaths, isValidPagePath, slugifyPagePath } from '../src/lib/page-path'

/** FR-002 shape: `/` or 1–3 lowercase alphanumeric segments. */
const SHAPE = /^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*){0,2})?$/

/** Every output of a normalized list must satisfy every FR-002 invariant. */
function expectInvariants(input: ReadonlyArray<string | undefined>): string[] {
  const out = normalizePagePaths(input)
  expect(out).toHaveLength(input.length)

  for (const [i, path] of out.entries()) {
    expect(path, `${JSON.stringify(input)} -> [${i}] ${path}: shape`).toMatch(SHAPE)
    expect(path, `${JSON.stringify(input)} -> [${i}] ${path}: unsafe chars`).not.toMatch(/[.\\\0]/)
  }

  expect(new Set(out).size, `${JSON.stringify(input)}: outputs unique`).toBe(out.length)
  expect(out.filter((p) => p === '/'), `${JSON.stringify(input)}: exactly one "/"`).toHaveLength(1)

  return out
}

describe('SC-003 — normalizePagePaths expected table', () => {
  const TABLE: Array<[string, ReadonlyArray<string | undefined>, string[]]> = [
    ['slugifies and strips the extension', ['/', '/About Us.html'], ['/', '/about-us']],
    ['merges segments past the third', ['/', '/a/b/c/d'], ['/', '/a/b/c-d']],
    ['demotes an empty path on page 2', ['/', ''], ['/', '/page-2']],
    ['demotes an all-symbol path on page 2', ['/', '/!!!'], ['/', '/page-2']],
    ['suffixes a case-folded duplicate', ['/', '/About', '/about'], ['/', '/about', '/about-2']],
    ['demotes a second home path', ['/', '/'], ['/', '/page-2']],
    ['page 1 is always home, even when it is not "/"', ['/x', '/y'], ['/', '/y']],
    ['demotes a home path on page 2', ['/x', '/'], ['/', '/page-2']],
    ['drops dot segments', ['/', '/../x'], ['/', '/x']],
    ['drops empty segments', ['/', '//x'], ['/', '/x']],
    ['suffixes skip values already taken', ['/', '/a', '/a', '/a-2'], ['/', '/a', '/a-3', '/a-2']],
    ['absent path becomes home on page 1', [undefined], ['/']],
    [
      'a demotion never displaces an explicit value',
      ['/x', '/', '/page-2'],
      ['/', '/page-2-2', '/page-2'],
    ],
    [
      'precomposed and decomposed accents slugify identically',
      // The first path carries a PRECOMPOSED é, the second a DECOMPOSED
      // `e` + U+0301. Without `normalize('NFC')` they slugify differently
      // (`/caf` vs `/cafe-` -> `/caf`), so this row is what proves the fold.
      ['/', '/caf\u00e9', '/cafe\u0301'],
      ['/', '/caf', '/caf-2'],
    ],
    [
      'accented segments degrade to ASCII',
      ['/', '/giới-thiệu', '/gió', '/giờ'],
      ['/', '/gi-i-thi-u', '/gi', '/gi-2'],
    ],
    ['a CJK-only path collapses and is demoted', ['/', '/关于'], ['/', '/page-2']],
    ['a trailing extension-like token is stripped', ['/', '/release-1.2', '/release-1'], ['/', '/release-1', '/release-1-2']],
  ]

  it.each(TABLE)('%s', (_label, input, expected) => {
    expect(normalizePagePaths(input)).toEqual(expected)
    // SC-003 ends with "and a second run returns identical output" — that is
    // part of the table scenario, so it is asserted per row, not only once in
    // a separate determinism test.
    expect(normalizePagePaths(input)).toEqual(normalizePagePaths(input))
    expectInvariants(input)
  })
})

describe('SC-003 — every table output satisfies the FR-002 invariants', () => {
  it.each<[ReadonlyArray<string | undefined>]>([
    [[]],
    [['/']],
    [['', '']],
    [['/', '/', '/', '/']],
    [['/a', '/a', '/a', '/a']],
    [[undefined, undefined, '/x']],
    [['/' + 'deep/'.repeat(10)]],
  ])('%j', (input) => {
    if (input.length === 0) {
      // Degenerate input, not a page list: nothing to normalize. FR-002's
      // "exactly one /" invariant is stated over a non-empty page list.
      expect(normalizePagePaths(input)).toEqual([])
      return
    }
    expectInvariants(input)
  })
})

describe('SC-003 — isValidPagePath predicate', () => {
  it.each(['/About Us.html', '/a/b/c/d', '', '/!!!', '/About', '/../x', '//x', '/about.html', 'about'])(
    'is false for %j',
    (raw) => {
      expect(isValidPagePath(raw)).toBe(false)
    },
  )

  it.each(['/', '/about', '/a/b/c', '/x-1'])('is true for %j', (raw) => {
    expect(isValidPagePath(raw)).toBe(true)
  })

  it('accepts every shape the normalizer can emit', () => {
    // The predicate and the normalizer must not drift: whatever the normalizer
    // produces is, by construction, a valid raw path a user could have typed.
    for (const input of [['/'], ['/', '/a'], ['/', '/a/b/c/d'], ['/', '/About Us.html'], [undefined, '/', '']]) {
      for (const path of normalizePagePaths(input)) {
        expect(isValidPagePath(path), `${path} from ${JSON.stringify(input)}`).toBe(true)
      }
    }
  })

  it('rejects non-string input that JSON can actually deliver', () => {
    // The signature says `string`, but import-check hands this values parsed
    // from arbitrary user JSON, where `{"path": 42}` is real input.
    //
    // Plain primitives are NOT enough to give this teeth: `String(42)` and
    // `String(null)` lack a leading `/`, so `RegExp.test`'s coercion already
    // yields false and the test passes with the `typeof` guard deleted. The
    // last two entries stringify to SHAPE-VALID paths, so without the guard
    // they coerce straight to `true` -- that is what makes this a real test of
    // the guard rather than of `RegExp.test`'s luck.
    const hostile: unknown[] = [
      42,
      null,
      undefined,
      {},
      [],
      true,
      { toString: () => '/a' },
      { toString: () => '/' },
    ]
    for (const value of hostile) {
      expect(() => isValidPagePath(value as string), String(value)).not.toThrow()
      expect(isValidPagePath(value as string), String(value)).toBe(false)
    }
  })

  it('is false for hostile strings, without throwing', () => {
    for (const raw of [' ', '/ ', '\0', '//', '/'.repeat(50), '/%2e%2e/', '%00', '\\']) {
      expect(() => isValidPagePath(raw), JSON.stringify(raw)).not.toThrow()
      expect(isValidPagePath(raw), JSON.stringify(raw)).toBe(false)
    }
  })
})

/**
 * SC-003 — `slugifyPagePath` is rule 1 on its own, so the editor's add-page
 * SUGGESTION can be built by the canonical slugifier instead of a second,
 * weaker one. Pinned as a literal table for the same reason the normalizer's is:
 * the suggestion is what the user sees and what the flow then validates, so a
 * drift here is a user-visible URL change, not an internal detail.
 */
describe('SC-003 — slugifyPagePath is the rule-1 slugifier', () => {
  it.each([
    ['& collapses with its spaces', 'Contact & Info', '/contact-info'],
    ['a precomposed accent is stripped whole', 'Café', '/caf'],
    ['non-ASCII runs strip, they do not transliterate', 'Giới thiệu', '/gi-i-thi-u'],
    ['plain words already worked before the fix', 'About Us', '/about-us'],
    ['an all-symbol name collapses to home', '!!!', '/'],
    ['a missing name collapses to home', undefined, '/'],
    ['surrounding whitespace is trimmed away', '  Spaced  ', '/spaced'],
    ['a trailing extension is stripped', 'About.html', '/about'],
    // The extension rule is a PATH rule now applied to a page NAME, so `v1.2`
    // loses its `.2`. Spec-literal, but pinned so it cannot change by accident.
    ['a trailing dot-number on a name is stripped', 'v1.2', '/v1'],
    ['segments past the third merge into it', 'a/b/c/d', '/a/b/c-d'],
  ])('%s: %j -> %s', (_label, raw, expected) => {
    expect(slugifyPagePath(raw as string | undefined)).toBe(expected)
  })

  it('gives the editor a suggestion it will never reject', () => {
    // The defect this function exists to remove: the editor suggested a value and
    // then ran it through `isValidPagePath`, so a perfectly good page name
    // produced an error attached to a field the user never typed. The names here
    // are chosen so the OLD inline slugifier (lowercase + spaces-to-dashes)
    // produces a shape-INVALID answer for each of them — that is what gives the
    // invariant teeth; an all-ASCII list would pass either implementation.
    const names = [
      'Contact & Info',
      'Café',
      'Giới thiệu',
      'About Us',
      '!!!',
      '???',
      '  Spaced  ',
      'A & B',
      'Docs/v2',
      'About.html',
      '100% Coverage',
      'Über uns',
      '关于我们',
      'a/b/c/d/e',
      '   ',
    ]

    for (const name of names) {
      const suggestion = slugifyPagePath(name)
      expect(isValidPagePath(suggestion), `${JSON.stringify(name)} -> ${suggestion}`).toBe(true)
      // `/` is the honest fallback for a name with no slug-able characters
      // (FR-R3): the duplicate check is then what tells the user the truth.
      if (suggestion !== '/') {
        expect(suggestion, `${JSON.stringify(name)} -> ${suggestion}`).toMatch(SHAPE)
        for (const segment of suggestion.split('/').filter(Boolean)) {
          expect(segment, `${JSON.stringify(name)} -> ${suggestion}`).not.toMatch(/[&.%]/)
        }
      }
    }
  })

  it('is exactly the transformation normalizePagePaths applies per page', () => {
    // DRY tripwire: `normalizePagePaths` must DELEGATE, not keep a private copy
    // that can drift. Each raw is named literally rather than looped over a
    // shared list so the assertion cannot shrink away with the code it checks.
    // `/!!!` is absent on purpose: it legitimately DEMOTES to `/page-2`, so it
    // has no comparable delegated value.
    const pairs: Array<[raw: string, delegated: string]> = [
      ['/About Us.html', '/about-us'],
      ['/café', '/caf'],
      ['/giới-thiệu', '/gi-i-thi-u'],
      ['/a/b/c/d', '/a/b/c-d'],
      ['/release-1.2', '/release-1'],
    ]
    for (const [raw, expected] of pairs) {
      expect(normalizePagePaths(['/', raw])[1], `delegation for ${raw}`).toBe(expected)
      expect(slugifyPagePath(raw), `slugifyPagePath for ${raw}`).toBe(expected)
    }
  })
})

describe('NF-002 — purity', () => {
  it('does not mutate the input array', () => {
    const input = Object.freeze(['/', '/a', '/a']) as ReadonlyArray<string | undefined>
    expect(() => normalizePagePaths(input)).not.toThrow()
    expect(normalizePagePaths(input)).toEqual(['/', '/a', '/a-2'])
    expect(input).toEqual(['/', '/a', '/a'])
  })

  it('does not mutate an unfrozen input array', () => {
    const input: Array<string | undefined> = ['/', '/a', '/a']
    normalizePagePaths(input)
    expect(input).toEqual(['/', '/a', '/a'])
  })

  it('reads no clock, randomness or page id', () => {
    // NF-002 says "no time, randomness or page-id dependence". The run-twice
    // check below is only PROBABLY able to catch that: a `Date.now() % 2`
    // implementation passes whenever both calls land in the same millisecond.
    // Scanning the source makes the guarantee deterministic instead.
    const source = readFileSync(resolve(import.meta.dirname, '..', 'src/lib/page-path.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    for (const forbidden of ['Date', 'performance', 'random', 'crypto']) {
      expect(source, `page-path.ts must not reference ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('is deterministic — a second run is identical', () => {
    const input: Array<string | undefined> = ['/', '/About Us.html', '/a/b/c/d', '', '/x', '/x', undefined]
    expect(normalizePagePaths(input)).toEqual(normalizePagePaths(input))
  })
})

/**
 * mulberry32 — a tiny, dependency-free, fully deterministic PRNG. NF-002 needs
 * ≥1,000 randomized inputs with identical re-runs; a fixed seed makes a failure
 * reproducible from the printed seed instead of flaky on CI.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEED = 0x5eed
/** Hostile fragments: traversal, NUL, backslash, encoded dots, CJK, accents. */
const FRAGMENTS = [
  'a',
  'B',
  '9',
  '-',
  '..',
  '.',
  '\\',
  '%2e',
  '%00',
  '\0',
  '//',
  ' ',
  '.html',
  '.png',
  '\u00e9', // precomposed e-acute
  '\u00c4', // A-diaeresis
  'e\u0301', // DECOMPOSED e-acute: same grapheme, different code points
  'gi',
  '\u5173\u4e8e', // CJK
  '\ud83d\ude00', // astral-plane emoji (surrogate pair)
]

function randomPath(rand: () => number): string {
  const depth = 1 + Math.floor(rand() * 10)
  const segments: string[] = []
  for (let i = 0; i < depth; i++) {
    const parts = 1 + Math.floor(rand() * 3)
    let segment = ''
    for (let j = 0; j < parts; j++) segment += FRAGMENTS[Math.floor(rand() * FRAGMENTS.length)]
    segments.push(segment)
  }
  return rand() < 0.5 ? `/${segments.join('/')}` : `/${segments.join('/')}/`
}

function randomList(rand: () => number): Array<string | undefined> {
  const length = 1 + Math.floor(rand() * 6)
  const list: Array<string | undefined> = []
  for (let i = 0; i < length; i++) {
    const roll = rand()
    if (roll < 0.1) list.push(undefined)
    else if (roll < 0.4 && list.length > 0) list.push(list[Math.floor(rand() * list.length)]) // duplicate injection
    else list.push(randomPath(rand))
  }
  return list
}

describe('NF-002 — randomized sweep', () => {
  it(`holds every invariant for 1000 seeded lists (seed 0x${SEED.toString(16)})`, () => {
    const rand = mulberry32(SEED)
    for (let i = 0; i < 1000; i++) {
      const input = randomList(rand)
      try {
        expectInvariants(input)
        expect(normalizePagePaths(input)).toEqual(normalizePagePaths(input))
      } catch (error) {
        // `cause` keeps Vitest's assertion diff (which path failed, and how);
        // stringifying the error flattens it into one opaque line, which is
        // useless when the offending list is a thousand cases deep.
        throw new Error(`NF-002 sweep failed at index ${i} for ${JSON.stringify(input)}`, { cause: error })
      }
    }
  })

  it('a page list of "/" repeated 60 times still yields 60 unique valid paths', () => {
    // The worst case for rule 4: every page collides and every suffix lands.
    const input = Array.from({ length: 60 }, () => '/')
    const out = expectInvariants(input)
    expect(out[0]).toBe('/')
    expect(out[1]).toBe('/page-2')
  })
})
// FR-H1 — a non-string path entry is REAL input, not a type error.
// An earlier review showed `slugifyPagePath` did `(raw ?? '').toLowerCase()`,
// which handles null/undefined and nothing else: `normalizePagePaths(['/', 42])`
// threw `(raw ?? '').toLowerCase is not a function`. Index 0 was never slugified
// (`out[0] = '/'` is assigned before the candidate loop), so the obvious probe
// `normalizePagePaths([42])` returned `['/']` and hid the defect entirely — which
// is exactly why the table below drives the non-string through EVERY index,
// including 0 and 1, rather than only the ones that trip it today.
describe('SC-003 — FR-H1 non-string paths at every index never throw', () => {
  const NON_STRINGS: Array<[string, unknown]> = [
    ['number 42', 42],
    ['zero', 0],
    ['boolean true', true],
    ['object {}', {}],
    ['array []', []],
    ['function', () => '/about'],
    ['NaN', Number.NaN],
  ]

  it.each(NON_STRINGS)('%s at index 1 degrades to a valid list', (_label, value) => {
    const out = expectInvariants(['/', value as unknown as string])
    expect(out[0]).toBe('/')
  })

  it.each(NON_STRINGS)('%s at index 0 degrades to a valid list', (_label, value) => {
    // Index 0 is never slugified today, so this asserts the PROMISE (never
    // throw, always valid) rather than a behaviour that happens to hold.
    const out = expectInvariants([value as unknown as string])
    expect(out).toEqual(['/'])
  })

  it.each(NON_STRINGS)('%s at index 2+ degrades to a valid list', (_label, value) => {
    expectInvariants(['/', '/about', value as unknown as string])
  })

  it('a mixed list of every non-string class at once still returns a valid list', () => {
    const out = expectInvariants([42 as unknown as string, {} as unknown as string, true as unknown as string, [] as unknown as string])
    expect(out).toEqual(['/', '/page-2', '/page-3', '/page-4'])
  })

  it('never throws for ANY non-string, across a value sweep (property-style)', () => {
    // Broadens the literal table above so the guarantee is a property of the
    // implementation, not of the seven values somebody happened to type.
    const values: unknown[] = [
      42, -1, 0, 1e21, Number.NaN, Number.POSITIVE_INFINITY,
      true, false, null, undefined, {}, [], ['/about'], () => '/about',
      new Date(0), /re/, 10n, Symbol('s'),
      { toString: () => '/about' }, { path: 42 },
    ]
    for (const [index, value] of values.entries()) {
      const input = ['/', '/about', '/contact', value] as unknown as string[]
      const out = normalizePagePaths(input)
      expect(out, `index ${index} (${String(value)})`).toHaveLength(input.length)
      for (const path of out) expect(path).toMatch(SHAPE)
    }
  })

  it('a Symbol entry is reachable and does not throw (explicit, since String(symbol) is a real hazard)', () => {
    // `String(Symbol('s'))` THROWS a TypeError while `${symbol}` does not, so a
    // fix written with template interpolation would pass the sweep above but
    // fail here. Named literally rather than folded into the table.
    expect(() => normalizePagePaths(['/', Symbol('s') as unknown as string])).not.toThrow()
    expect(normalizePagePaths(['/', Symbol('s') as unknown as string])[1]).toMatch(SHAPE)
  })
})
