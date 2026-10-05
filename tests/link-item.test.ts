/**
 * Phase 04 — direct unit coverage for the shared link reader.
 *
 * `toLinkItem` / `linkLabel` are the single shape-preserving entry points used
 * by the editor blocks, the properties panel and the exporter. `linkLabel` is
 * what keeps a `{label,href}` object from exporting as `[object Object]`, so its
 * branches (string passthrough, object, primitive, null/array fallback) are
 * pinned here rather than only exercised indirectly.
 */
import { describe, it, expect } from 'vitest'
import { toLinkItem, linkLabel } from '../src/lib/link-item'

describe('toLinkItem — shape-preserving reader', () => {
  it('reads a plain string as {label}, never adding an href', () => {
    expect(toLinkItem('About')).toEqual({ label: 'About' })
  })

  it('keeps {label,href} with href verbatim', () => {
    expect(toLinkItem({ label: 'Home', href: '/h?a=1&b=2' })).toEqual({ label: 'Home', href: '/h?a=1&b=2' })
  })

  it('falls back to the `text` key when `label` is absent, and drops a non-string href', () => {
    expect(toLinkItem({ text: 'Docs', href: 42 })).toEqual({ label: 'Docs' })
  })

  it('stringifies number/boolean primitives', () => {
    expect(toLinkItem(7)).toEqual({ label: '7' })
    expect(toLinkItem(true)).toEqual({ label: 'true' })
  })

  it('yields an empty label for null / array / object without a label-ish key', () => {
    expect(toLinkItem(null)).toEqual({ label: '' })
    expect(toLinkItem(['a'])).toEqual({ label: '' })
    // href still survives even when there is no label to pair it with.
    expect(toLinkItem({ href: '/x' })).toEqual({ label: '', href: '/x' })
  })
})

describe('linkLabel — label-only view for non-anchor emitters', () => {
  it('is byte-identical for a legacy string', () => {
    expect(linkLabel('Privacy')).toBe('Privacy')
  })

  it('extracts the label from an object (no [object Object])', () => {
    expect(linkLabel({ label: 'Terms', href: '/t' })).toBe('Terms')
    expect(linkLabel({ label: 'Terms', href: '/t' })).not.toContain('[object')
  })
})
