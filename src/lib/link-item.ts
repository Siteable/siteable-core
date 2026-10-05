import type { LinkItem } from './block-metadata'

// Shared, shape-preserving link reader for the editor blocks, the properties
// panel and (phase 05) the exporter. Never converts between the string and the
// object form — a plain string reads as `{ label }`, an object keeps its
// `{ label, href }` (href only when it is a string).
export function toLinkItem(value: unknown): LinkItem {
  if (typeof value === 'string') return { label: value }
  if (typeof value === 'number' || typeof value === 'boolean') return { label: String(value) }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const entry = value as Record<string, unknown>
    const label =
      typeof entry.label === 'string' ? entry.label : typeof entry.text === 'string' ? entry.text : ''
    return typeof entry.href === 'string' ? { label, href: entry.href } : { label }
  }
  return { label: '' }
}

/**
 * Label-only view of a link entry. Emitters that have no anchor yet (and the
 * anchor-less fallback branch) render this instead of the raw entry, so a
 * `{label,href}` object never becomes `[object Object]` and a legacy string
 * stays byte-identical (`linkLabel('About') === 'About'`).
 */
export function linkLabel(value: unknown): string {
  return toLinkItem(value).label
}
