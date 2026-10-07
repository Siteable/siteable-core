/**
 * FR-002 — page-path normalization + raw-path shape predicate.
 *
 * This module decides a page's published URL, so it is pure and framework-free
 * by construction: no React, no clock, no randomness, no page ids. The output
 * alphabet is `[a-z0-9-/]` only, which is what makes a normalized path safe to
 * use verbatim as an object key — no `.` can address `index.html`, no `\` or NUL
 * can traverse, and no `/..` can escape the site prefix.
 *
 * Deliberate, spec-literal degradation: non-ASCII is STRIPPED, not
 * transliterated, so `/giới-thiệu` becomes `/gi-i-thi-u` and a CJK-only path
 * collapses to `/` and is then demoted. Diacritic folding would change those
 * URLs and needs its own RFC; it is not a fix hidden in this function.
 */

/** FR-002 shape: `/`, or 1–3 lowercase alphanumeric segments. Module-private. */
const PAGE_PATH_SHAPE = /^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*){0,2})?$/

/** Trailing `.<alnum>` on the whole path, so `/about us.html` loses only `.html`. */
const TRAILING_EXTENSION = /\.[a-z0-9]+$/

/** Any run of characters outside `[a-z0-9]` collapses to a single `-`. */
const NON_SLUG_RUN = /[^a-z0-9]+/g

/** Beyond this many segments, the tail folds into the third one. */
const MAX_SEGMENTS = 3

/** A page path after normalization, before uniqueness is resolved. */
type Candidate = { index: number; value: string; demoted: boolean }

/**
 * Rule 1 — one raw path (or page NAME) to its slug form.
 *
 * FR-H1: `typeof raw === 'string' ? raw : ''` keeps a missing OR MALFORMED path
 * total (it degrades to `/`, which the home rules then place). `raw ?? ''` was
 * not enough: it covers `null`/`undefined` and nothing else, so
 * `normalizePagePaths(['/', 42])` threw `(raw ?? '').toLowerCase is not a
 * function`. That is real input, not a type error — this module crosses a
 * package boundary into a consuming app's import check and a server-side
 * publisher, both of which hold JSON-parsed configs where `path` is only `string` by trust (the
 * same threat model that already put a `typeof` guard on `isValidPagePath`).
 * A publisher calls the exporter per publish, so a `TypeError` here aborts the whole
 * publish — precisely what the `?? []` guards one line away exist to prevent.
 *
 * The `typeof` test is deliberately NOT `String(raw)`: `String(Symbol('s'))`
 * throws, so an interpolation-style coercion would move the crash rather than
 * remove it. A non-string carries no path information worth recovering, so it
 * degrades to `''` and is then demoted to `/page-{n}` by rules 2–4.
 *
 * Exported at module level, NOT through the barrel: the editor's add-page
 * popover builds its suggested path with this, so the value it suggests and
 * the value it validates with `isValidPagePath` come from one rule rather than
 * two. The published API stays exactly `normalizePagePaths` +
 * `isValidPagePath` — a UI convenience is not a reason to widen a pinned
 * package's surface.
 *
 * `normalize('NFC')` is what makes a precomposed `é` and a decomposed
 * `e`+U+0301 collide: composing first means both leave the run as ONE character
 * that gets stripped, instead of the decomposed form leaving a bare ASCII `e`
 * behind and slugs as `/cafe`. The call ORDER relative to `toLowerCase` does not
 * matter — both orderings agree on every input probed — so do not spend
 * effort defending it.
 */
export function slugifyPagePath(raw: string | undefined): string {
  const src = typeof raw === 'string' ? raw : ''
  const lowered = src.toLowerCase().normalize('NFC')

  const segments = lowered
    .replace(TRAILING_EXTENSION, '')
    .split('/')
    .map((segment) => segment.replace(NON_SLUG_RUN, '-').replace(/^-+|-+$/g, ''))
    .filter((segment) => segment.length > 0)

  if (segments.length === 0) return '/'

  const capped =
    segments.length > MAX_SEGMENTS
      ? [...segments.slice(0, MAX_SEGMENTS - 1), segments.slice(MAX_SEGMENTS - 1).join('-')]
      : segments

  return `/${capped.join('/')}`
}

/** Append `-{suffix}` to the LAST segment, so `/a/b` duplicates become `/a/b-2`. */
function withSuffix(value: string, suffix: number): string {
  const segments = value.split('/')
  segments[segments.length - 1] = `${segments[segments.length - 1]}-${suffix}`
  return segments.join('/')
}

/** The first `-{k}` (k ≥ 2) not already spoken for. Suffixes may skip numbers. */
function firstFreeSuffix(value: string, taken: Set<string>): string {
  for (let k = 2; ; k++) {
    const candidate = withSuffix(value, k)
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Rules 2–4 — place home, then make every path unique.
 *
 * Page 1 is always `/`: rule 2 leaves only page 1 able to hold `/`, rule 3
 * promotes it if it does not, and `/` is reserved before any suffix is minted.
 *
 * Reservation order is the load-bearing part. Every first-occurrence EXPLICIT
 * value is reserved before any rule-2 demotion claims `/page-{n}`, so a
 * generated path can never displace a path the author typed — see rule 4.
 * Without this, `['/x', '/', '/page-2']` would rewrite page 3's valid path.
 */
function resolvePagePaths(rawPaths: ReadonlyArray<string | undefined>): string[] {
  if (rawPaths.length === 0) return []

  const out: string[] = rawPaths.map(() => '')
  out[0] = '/'

  const candidates: Candidate[] = []
  for (let i = 1; i < rawPaths.length; i++) {
    const value = slugifyPagePath(rawPaths[i])
    candidates.push({ index: i, value, demoted: value === '/' })
  }

  // Reserve every first-occurrence explicit value up front, before any demotion
  // picks a slot. This is what keeps rule 4 "demotion-last".
  const reserved = new Set<string>(['/'])
  for (const candidate of candidates) {
    if (!candidate.demoted) reserved.add(candidate.value)
  }

  const taken = new Set<string>(reserved)

  for (const candidate of candidates) {
    if (!candidate.demoted) continue
    const slot = `/page-${candidate.index + 1}`
    const value = taken.has(slot) ? firstFreeSuffix(slot, taken) : slot
    taken.add(value)
    out[candidate.index] = value
  }

  // Explicit pages in page order: the first occurrence of a value keeps it,
  // every later one is suffixed. `emitted` is what "first occurrence" means
  // here — `reserved` cannot tell a first occurrence from a duplicate.
  const emitted = new Set<string>(['/'])
  for (const candidate of candidates) {
    if (candidate.demoted) continue
    const value = emitted.has(candidate.value) ? firstFreeSuffix(candidate.value, taken) : candidate.value
    taken.add(value)
    emitted.add(value)
    out[candidate.index] = value
  }

  return out
}

/**
 * FR-002 — normalize an ordered page list to one unique, valid path per page,
 * in the input's order. Pure: the input array is never mutated, and the result
 * depends on nothing but the input values.
 *
 * An empty input yields an empty output. FR-002's "exactly one `/`" invariant
 * is stated over a non-empty page list; callers that hold a site config with no
 * pages render a single document at `/` (FR-001) and never need this function.
 */
export function normalizePagePaths(rawPaths: ReadonlyArray<string | undefined>): string[] {
  return resolvePagePaths(rawPaths)
}

/**
 * FR-002 — does this raw path already satisfy the shape rule? The editor's
 * add-page flow rejects on `false` (FR-003), and a consuming app's import check asks
 * this rather than keeping a second copy of the regex (NF-005 keeps this module
 * dependency-free so a worker can import it alone).
 *
 * The `typeof` guard is NOT redundant with the signature. Callers reach this
 * across a package boundary with config parsed from JSON, where `path` is only
 * `string` by trust — `{"path": 42}` is real input for a config import. The guard
 * makes "not a string" answer `false` instead of relying on `RegExp.test`'s
 * silent coercion, which would quietly accept `"42"` if the shape ever widened.
 */
export function isValidPagePath(rawPath: string): boolean {
  return typeof rawPath === 'string' && PAGE_PATH_SHAPE.test(rawPath)
}