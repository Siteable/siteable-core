/**
 * Shared URL policy for every URL the exporter emits into an `href` / `src`
 * attribute, and for every URL the editor stores on a link prop.
 *
 * Spec: `specs/publish-fidelity/spec.md` FR-004 (SC-002), NF-001, NF-006.
 *
 * Design constraints:
 *  - Deny-by-default. Anything not positively classified below is rejected.
 *  - No backtracking-prone regex. A single char-code loop plus a "first `:` before
 *    any `/?#`" scheme scan keeps this O(n); the only regexes here (`/^\s+/` and a
 *    literal `search(/[/?#]/)`) are both linear and anchored, satisfying NF-001's
 *    "no catastrophic backtracking on a 2 KB input" requirement by construction.
 *  - NF-006: this module imports nothing at all — not even the TS stdlib — so
 *    it can be pulled into the editor, the normalizer, and the exporter without
 *    creating a dependency cycle or pulling a runtime package into the bundle.
 *
 * Deny reasons, evaluated in order:
 *   1. not a string / empty / whitespace-only
 *   2. contains a control character (U+0000–U+001F, U+007F) anywhere
 *   3. contains a backslash, or begins `//` — both spell a value that escapes
 *      the origin (browsers fold `\` to `/` in the authority position)
 *   4. first path segment contains `& < > " ' \` (path-injection guard, which also
 *      subsumes entity-obfuscated scheme forms like `&#106;avascript:`). Reached
 *      for scheme-less values and for opaque schemes; the `//authority` of an
 *      `http(s)` URL is never inspected.
 *   5. has a scheme that is not in the allow-list for the requested context
 *
 * Note: the policy NEVER mutates its input. Callers still HTML-escape the
 * original value; this predicate only decides whether to emit it at all.
 */

export interface UrlPolicyOptions {
  /** Restrict to `https:` only — used for image/gallery/banner `src` values. */
  image?: boolean
}

/** Schemes allowed for ordinary links (FR-004). */
const LINK_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']

/** Schemes allowed for image `src` values (FR-004, last sentence). */
const IMAGE_SCHEMES = ['https:']

/** Characters rejected in the first `/`-delimited segment (deny reason 4). */
const SEGMENT_DENY_CHARS = ['&', '<', '>', '"', "'", '\\']

function isControlCode(code: number): boolean {
  return code <= 0x1f || code === 0x7f
}

/**
 * Return the lower-cased scheme of `value`, or `null` when the value carries no
 * scheme. A scheme is the substring before the first `:` — but only when that
 * `:` is not preceded by a `/`, `?` or `#` (so `/a:b`, `?x:y` and `#a:b` are
 * correctly treated as scheme-less paths and fragments).
 */
function readScheme(value: string): string | null {
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (char === '/') return null
    if (char === '?' || char === '#') return null
    if (char === ':') return value.slice(0, i + 1).toLowerCase()
  }
  return null
}

/** Deny reason 4: entity/quote/backslash characters in the first path segment. */
function firstSegmentIsClean(value: string): boolean {
  const end = value.search(/[/?#]/)
  const segment = end === -1 ? value : value.slice(0, end)
  for (let i = 0; i < segment.length; i += 1) {
    if (SEGMENT_DENY_CHARS.includes(segment[i])) return false
  }
  return true
}

/**
 * Decide whether `value` may be emitted into an `href` (or, with
 * `opts.image`, into an image `src`).
 *
 * @param value  the raw stored URL; never mutated
 * @param opts   `{ image: true }` narrows the allow-list to `https:`
 */
export function isAllowedUrl(value: string, opts?: UrlPolicyOptions): boolean {
  // Deny reason 1 — non-strings and blanks never produce an attribute.
  if (typeof value !== 'string') return false
  if (value.trim() === '') return false

  // Deny reason 2 — a control character anywhere poisons the scheme, since
  // browsers strip \t \n \r before parsing. `java\tscript:` must not survive.
  for (let i = 0; i < value.length; i += 1) {
    if (isControlCode(value.charCodeAt(i))) return false
  }

  const allowed = opts?.image ? IMAGE_SCHEMES : LINK_SCHEMES

  // Strip leading whitespace only for the analysis below; the caller's escaping
  // still operates on the original string.
  const trimmed = value.replace(/^\s+/, '')

  // Deny reason 3 — protocol-relative URLs escape the page's origin. Browsers
  // fold `\` to `/` in the authority position, so `/\evil.example` and
  // `https:/\evil.example` resolve off-origin exactly like `//evil.example` —
  // and `escapeHtml` does not help, because backslash needs no escaping. A
  // backslash is never legitimate in a URL we emit, so reject it outright
  // rather than special-casing the two leading-slash spellings.
  if (trimmed.includes('\\')) return false
  if (trimmed.startsWith('//')) return false

  const scheme = readScheme(trimmed)

  if (scheme === null) {
    // Image `src` is restricted to an absolute `https:` URL (FR-004); a
    // relative path would resolve against whatever host serves the export.
    if (opts?.image) return false
    // Scheme-less: a `#fragment` or a relative path. Deny reason 4 still applies
    // to the leading segment, which catches `&#106;avascript:` — `&` before any
    // `/` means this is not a clean relative path.
    return firstSegmentIsClean(trimmed)
  }

  if (!allowed.includes(scheme)) return false

  // Deny reason 4, applied to what follows the scheme. Be precise about its
  // reach: for `http:`/`https:` that remainder begins with the `//authority`, so
  // its first `/`-delimited segment is EMPTY and the guard is a no-op — the
  // authority and path of an http(s) URL are never inspected for quotes. It
  // only bites for opaque schemes (`mailto:`, `tel:`) whose remainder has no
  // authority to skip over.
  //
  // Consequence, stated plainly because it is a security boundary: this policy
  // does NOT neutralize a quote inside an `http(s)` URL. A caller MUST still
  // HTML-escape the value before writing it into an attribute — `isAllowedUrl`
  // decides whether to emit a URL, not how to render it. Phase 02 wires it at
  // the call sites that already escape.
  return firstSegmentIsClean(trimmed.slice(scheme.length))
}
