/**
 * ISS-005 — prop normalization at the generation chokepoint.
 *
 * AI generators (Gemini, host /api/generate) return block props that violate the
 * declared contracts in block-metadata (e.g. navbar `links` as [{label,href}]
 * where the block declares string[]). Blocks render those props unguarded →
 * React "Objects are not valid as a React child" crash. validateBlock was the
 * hole: `{ ...defaultProps, ...raw.props }` never checked raw VALUES.
 *
 * This module coerces raw prop values against the SHAPE of the block's
 * defaultProps — fully generic, zero block-name hardcoding.
 *
 * POLICY (review item 2): an empty raw array (e.g. `links: []`) is replaced by
 * the DEFAULT array — DELIBERATE, not an oversight. At this layer the config
 * is unvalidated AI/host output, so "empty" is indistinguishable from
 * "generator emitted nothing meaningful"; rendering a navbar with zero links
 * is a silent broken page, defaults are recoverable. Codified by:
 *   tests/prop-normalization.test.ts — 'empty raw array falls back to non-empty defaultProps'
 *   tests/validate-site-config.test.ts — footer columns 'links: []' entry case
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

function normalizeValue(raw: unknown, def: unknown): unknown {
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
        // array-of-objects: first default entry is the shape; non-object entries dropped
        if (isPlainObject(entry)) out.push(normalizeBlockProps(entry, elemDef))
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
    if (isPlainObject(raw)) return normalizeBlockProps(raw, def)
    return def
  }

  // no contract declared for this default (null/undefined) → keep raw
  return raw
}

/**
 * Coerce `rawProps` values against the shape of `defaultProps`.
 * - Keys missing from rawProps are NOT injected — the caller merges defaultProps.
 * - Keys present in rawProps but absent from defaultProps are kept as-is
 *   (editor JSON patches may legitimately add keys; never discard data).
 * - Non-object rawProps (null, string, array) normalize to {}.
 */
export function normalizeBlockProps(
  rawProps: unknown,
  defaultProps: Record<string, unknown>,
): Record<string, unknown> {
  if (!isPlainObject(rawProps)) return {}

  const out: Record<string, unknown> = { ...rawProps }
  for (const [key, def] of Object.entries(defaultProps)) {
    if (key in out) {
      out[key] = normalizeValue(out[key], def)
    }
  }
  return out
}
