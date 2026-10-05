/**
 * ISS-005 — prop normalization at the generation chokepoint.
 *
 * AI generators (Gemini, host /api/generate) return block props that violate the
 * declared contracts in block-metadata (e.g. a navigation block's `links` given
 * as [{label,href}] where the contract declares string[]). Blocks render those
 * props unguarded → React "Objects are not valid as a React child" crash.
 * validateBlock was the hole: `{ ...defaultProps, ...raw.props }` never checked
 * raw VALUES.
 *
 * This module coerces raw prop values against the SHAPE of the block's
 * defaultProps — fully generic, zero block-name hardcoding.
 *
 * Phase 04 adds a declared LINK-ARRAY pass. A block may name prop PATHS whose
 * entries are links (`key`, `key[]`, `key[].sub`). That pass is SHAPE-PRESERVING
 * — a string entry stays a string, an object entry keeps its `{label, href}` —
 * and the shape pass SKIPS those paths so it can never re-collapse them.
 *
 * POLICY (review item 2): an empty raw array (e.g. `links: []`) is replaced by
 * the DEFAULT array — DELIBERATE, not an oversight. At this layer the config
 * is unvalidated AI/host output, so "empty" is indistinguishable from
 * "generator emitted nothing meaningful"; rendering a bar with zero links
 * is a silent broken page, defaults are recoverable. Codified by:
 *   tests/prop-normalization.test.ts — 'empty raw array falls back to non-empty defaultProps'
 *   tests/validate-site-config.test.ts — a nested column 'links: []' entry case
 * A user who genuinely wants zero links sets them via the editor AFTER this
 * chokepoint (normalize only runs on generation validation, never on
 * editor/store round-trips), so user intent is expressible elsewhere.
 */

// For a string contract, an object value is best-effort rescued by taking the
// first string field among these display-ish keys (order = priority).
const STRING_FALLBACK_FIELDS = ['label', 'text', 'title', 'name'] as const

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Coerce any value to a string for a `string`/`string[]` contract; null = unresolvable. */
function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  if (isPlainObject(value)) {
    for (const field of STRING_FALLBACK_FIELDS) {
      if (typeof value[field] === 'string') return value[field] as string
    }
  }
  return null
}

// ── declared link-array pass ────────────────────────────────────────────────
// Path grammar: `key` | `key[].sub`. A segment carrying `[]` iterates the array
// at that key; the FINAL segment is the link array itself. Iteration is
// positional, so the `[]` suffix is stripped here and the traversal treats any
// non-final segment as the iterating one.

interface PathSegment {
  key: string
}

function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  for (const raw of path.split('.')) {
    if (raw === '') continue
    segments.push({ key: raw.endsWith('[]') ? raw.slice(0, -2) : raw })
  }
  return segments
}

/**
 * Canonical traversal form of a declared path: every iterating (non-final)
 * segment carries `[]`, the final segment does not. The link pass and the shape
 * pass both build paths in this exact form, so a declared `columns.links` and
 * `columns[].links` are equivalent and the skip-set can never disagree with the
 * traversal (no silent shape loss from a bracket-less declaration).
 */
function canonicalPath(segments: PathSegment[]): string {
  return segments.map((seg, i) => (i < segments.length - 1 ? `${seg.key}[]` : seg.key)).join('.')
}

/**
 * Map one raw link entry to its shape-preserving form, or null to DROP it.
 * - string → unchanged string (never coerced to an object)
 * - plain object → { label, href? } (href only when a string survives)
 * - number / boolean → String via toStringOrNull
 * - null / array / unresolvable object → null (dropped)
 */
function toLinkEntry(entry: unknown): string | { label: string; href?: string } | null {
  if (typeof entry === 'string') return entry
  if (isPlainObject(entry)) {
    const label = toStringOrNull(entry)
    if (label === null) return null
    const href = toStringOrNull(entry.href)
    return href === null ? { label } : { label, href }
  }
  return toStringOrNull(entry)
}

/** Shape-preserving rewrite of the array at a declared final segment. */
function mapLinkArray(rawValue: unknown, defaultValue: unknown): unknown {
  if (Array.isArray(rawValue)) {
    const mapped: (string | { label: string; href?: string })[] = []
    for (const entry of rawValue) {
      const link = toLinkEntry(entry)
      if (link !== null) mapped.push(link)
    }
    if (mapped.length > 0) return mapped
  }
  // Non-array value, or empty / all-dropped array → the declared DEFAULT value.
  return defaultValue
}

/** Apply one path segment, writing into a copy of `container`. */
function applyLinkSegment(
  container: Record<string, unknown>,
  segment: PathSegment,
  rest: PathSegment[],
  defaultContainer: Record<string, unknown>,
): Record<string, unknown> {
  const key = segment.key
  // An absent key is left absent — the caller merges `defaultProps` itself.
  // (Only a key the raw config actually carries is rewritten here.)
  if (!(key in container)) return container
  const defaultValue = defaultContainer[key]

  if (rest.length === 0) {
    container[key] = mapLinkArray(container[key], defaultValue)
    return container
  }

  // Only `key[].sub` reaches here: iterate the array's elements and apply the
  // remainder to each. The element shape default is ALWAYS the first declared
  // default element — there is no per-index contract.
  const rawValue = container[key]
  if (!Array.isArray(rawValue)) {
    container[key] = defaultValue
    return container
  }
  const defaultElems = Array.isArray(defaultValue) ? defaultValue : []
  const defaultElem = isPlainObject(defaultElems[0]) ? defaultElems[0] : {}
  container[key] = rawValue.map((elem) =>
    isPlainObject(elem) ? applyLinkSegment({ ...elem }, rest[0], rest.slice(1), defaultElem) : elem,
  )
  return container
}

function applyLinkPaths(
  rawProps: Record<string, unknown>,
  defaultProps: Record<string, unknown>,
  paths: PathSegment[][],
): Record<string, unknown> {
  let out: Record<string, unknown> = { ...rawProps }
  for (const segments of paths) {
    out = applyLinkSegment(out, segments[0], segments.slice(1), defaultProps)
  }
  return out
}

/**
 * Recursion context for the shape pass. `pathSet` holds the declared link paths
 * in their full dotted form (`links`, `columns[].links`); `prefix` is the dotted
 * path of the container currently being normalized. A key is skipped only when
 * its FULL path is in `pathSet`, so a non-declared prop named `links` nested
 * elsewhere is still normalized normally.
 */
interface ShapeContext {
  pathSet: Set<string>
  prefix: string
}

function normalizeValue(raw: unknown, def: unknown, ctx: ShapeContext): unknown {
  // string contract
  if (typeof def === 'string') {
    return toStringOrNull(raw) ?? def
  }

  // number contract: keep finite numbers, accept numeric strings, else default
  if (typeof def === 'number') {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw)
    return def
  }

  // boolean contract
  if (typeof def === 'boolean') {
    if (typeof raw === 'boolean') return raw
    if (raw === 'true') return true
    if (raw === 'false') return false
    return def
  }

  // array contracts
  if (Array.isArray(def)) {
    if (!Array.isArray(raw)) return def
    if (def.length === 0) return raw // no element shape declared → pass through

    const elemDef = def[0]
    const out: unknown[] = []
    for (const entry of raw) {
      if (typeof elemDef === 'string') {
        const s = toStringOrNull(entry) // string entries kept, objects rescued, garbage dropped
        if (s !== null) out.push(s)
      } else if (isPlainObject(elemDef)) {
        // array-of-objects: first default entry is the shape; non-object entries dropped.
        // The element prefix is `<array path>[]` so a declared `key[].sub` matches.
        if (isPlainObject(entry)) {
          out.push(applyShape(entry, elemDef, { pathSet: ctx.pathSet, prefix: `${ctx.prefix}[]` }))
        }
      } else if (typeof entry === typeof elemDef) {
        // primitive (number/boolean) elements: keep type-matching entries as-is
        out.push(entry)
      }
    }
    // all-garbage / emptied array → show defaults rather than render nothing
    if (out.length === 0) return def
    return out
  }

  // object contract: recurse per key
  if (isPlainObject(def)) {
    if (isPlainObject(raw)) return applyShape(raw, def, ctx)
    return def
  }

  // no contract declared for this default (null/undefined) → keep raw
  return raw
}

/**
 * Normalize every key of `props` against `defaults`. A key is skipped — left
 * exactly as the link pass wrote it — only when its full dotted path is a
 * declared link path.
 */
function applyShape(
  props: Record<string, unknown>,
  defaults: Record<string, unknown>,
  ctx: ShapeContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...props }
  for (const [key, def] of Object.entries(defaults)) {
    if (!(key in out)) continue
    const path = ctx.prefix ? `${ctx.prefix}.${key}` : key
    if (ctx.pathSet.has(path)) continue // declared link path — the link pass owns it
    out[key] = normalizeValue(out[key], def, { pathSet: ctx.pathSet, prefix: path })
  }
  return out
}

/**
 * Coerce `rawProps` values against the shape of `defaultProps`.
 * - Keys missing from rawProps are NOT injected — the caller merges defaultProps.
 * - Keys present in rawProps but absent from defaultProps are kept as-is
 *   (editor JSON patches may legitimately add keys; never discard data).
 * - Non-object rawProps (null, string, array) normalize to {}.
 * - `linkArrays` names prop paths whose entries are links (string | {label,href});
 *   those paths are normalized shape-preservingly and skipped by the shape pass.
 */
export function normalizeBlockProps(
  rawProps: unknown,
  defaultProps: Record<string, unknown>,
  linkArrays: string[] = [],
): Record<string, unknown> {
  if (!isPlainObject(rawProps)) return {}

  const paths = linkArrays.map(parsePath).filter((p) => p.length > 0)
  const withLinks = applyLinkPaths(rawProps, defaultProps, paths)
  const pathSet = new Set(paths.map(canonicalPath))
  return applyShape(withLinks, defaultProps, { pathSet, prefix: '' })
}
