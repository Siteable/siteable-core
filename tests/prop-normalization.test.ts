import { describe, it, expect } from 'vitest'
import { normalizeBlockProps } from '../src/lib/prop-normalization'

// ISS-005 contract source: shapes mirror src/lib/block-metadata defaultProps.
const navbarDefaults = { logo: 'Brand', links: ['Features', 'Pricing', 'About'], ctaText: 'Get Started' }

describe('normalizeBlockProps — string defaults', () => {
  it('keeps raw strings as-is', () => {
    expect(normalizeBlockProps({ logo: 'Acme' }, navbarDefaults).logo).toBe('Acme')
  })

  it('coerces numbers and booleans via String()', () => {
    const out = normalizeBlockProps({ logo: 42, ctaText: true }, navbarDefaults)
    expect(out.logo).toBe('42')
    expect(out.ctaText).toBe('true')
  })

  it('extracts first string field among label/text/title/name from objects', () => {
    const out = normalizeBlockProps(
      { logo: { href: '#', text: 'Home' }, ctaText: { title: 'Buy' } },
      navbarDefaults,
    )
    expect(out.logo).toBe('Home') // text
    expect(out.ctaText).toBe('Buy') // title
    expect(normalizeBlockProps({ logo: { name: 'N' } }, navbarDefaults).logo).toBe('N')
  })

  it('label wins over later fields in the priority list', () => {
    const out = normalizeBlockProps({ logo: { text: 'T', label: 'L', title: 'X' } }, navbarDefaults)
    expect(out.logo).toBe('L')
  })

  it('falls back to the default when the object has no resolvable string field', () => {
    expect(normalizeBlockProps({ logo: { href: '#' } }, navbarDefaults).logo).toBe('Brand')
  })

  it('falls back to the default for null/array values', () => {
    expect(normalizeBlockProps({ logo: null }, navbarDefaults).logo).toBe('Brand')
    expect(normalizeBlockProps({ logo: ['x'] }, navbarDefaults).logo).toBe('Brand')
  })
})

describe('normalizeBlockProps — string[] defaults', () => {
  it('ISS-005 regression core: object links coerce to their label strings', () => {
    const raw = { links: [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }] }
    expect(normalizeBlockProps(raw, navbarDefaults).links).toEqual(['Home', 'Pricing'])
  })

  it('keeps plain strings and coerces numbers', () => {
    expect(normalizeBlockProps({ links: ['A', 'B', 5] }, navbarDefaults).links).toEqual(['A', 'B', '5'])
  })

  it('drops unresolvable entries in mixed valid+garbage arrays', () => {
    const raw = { links: ['A', { href: '#' }, null, 7, [1], 'B'] }
    expect(normalizeBlockProps(raw, navbarDefaults).links).toEqual(['A', '7', 'B'])
  })

  it('all-garbage array falls back to defaultProps', () => {
    expect(normalizeBlockProps({ links: [{ href: '#' }, null] }, navbarDefaults).links)
      .toEqual(['Features', 'Pricing', 'About'])
  })

  it('empty raw array falls back to non-empty defaultProps', () => {
    expect(normalizeBlockProps({ links: [] }, navbarDefaults).links).toEqual(['Features', 'Pricing', 'About'])
  })

  it('non-array raw falls back to defaultProps', () => {
    expect(normalizeBlockProps({ links: 'Home' }, navbarDefaults).links).toEqual(['Features', 'Pricing', 'About'])
  })
})

describe('normalizeBlockProps — object and object[] defaults', () => {
  const pricingDefaults = { title: 'Pricing', subtitle: 'Choose', tiers: [{ name: 'Starter', price: '$0', features: ['1 site'], cta: 'Go' }] }

  it('recurses into plain-object defaults per key', () => {
    const defaults = { meta: { title: 'T', count: 1 } }
    const out = normalizeBlockProps({ meta: { title: 99, count: 'nope' } }, defaults)
    // known nested keys are coerced against the nested shape...
    expect(out.meta).toEqual({ title: '99', count: 1 })
    // ...but missing nested keys are NOT backfilled from the default entry —
    // backfilling e.g. a pricing tier price with '$0' would invent wrong data
    expect(normalizeBlockProps({ meta: { title: 99 } }, defaults).meta).toEqual({ title: '99' })
  })

  it('array-of-objects: uses FIRST default entry as shape and normalizes nested string[]', () => {
    const raw = {
      tiers: [
        { name: 'Pro', price: { text: '$19' }, features: [{ label: 'Unlimited sites' }, 'SSO', null], cta: 'Buy', featured: true },
      ],
    }
    const out = normalizeBlockProps(raw, pricingDefaults)
    expect(out.tiers).toEqual([
      { name: 'Pro', price: '$19', features: ['Unlimited sites', 'SSO'], cta: 'Buy', featured: true },
    ])
    // featured is NOT in the first default entry but must be preserved (unknown-key rule)
  })

  it('array-of-objects: drops non-object entries, keeps resolvable ones', () => {
    const raw = { tiers: ['junk', { name: 'A', price: '$1', features: ['x'], cta: 'g' }] }
    const out = normalizeBlockProps(raw, pricingDefaults)
    expect(out.tiers).toEqual([{ name: 'A', price: '$1', features: ['x'], cta: 'g' }])
  })

  it('array-of-objects: all entries dropped or raw not array → defaultProps shape', () => {
    expect(normalizeBlockProps({ tiers: [null, 'x'] }, pricingDefaults).tiers).toEqual(pricingDefaults.tiers)
    expect(normalizeBlockProps({ tiers: 'nope' }, pricingDefaults).tiers).toEqual(pricingDefaults.tiers)
  })
})

describe('normalizeBlockProps — other primitives and pass-through', () => {
  const dividerDefaults = { height: 60, width: 'full' }

  it('number defaults: keep finite numbers, coerce numeric strings, default otherwise', () => {
    expect(normalizeBlockProps({ height: 90 }, dividerDefaults).height).toBe(90)
    expect(normalizeBlockProps({ height: '40' }, dividerDefaults).height).toBe(40)
    expect(normalizeBlockProps({ height: 'abc' }, dividerDefaults).height).toBe(60)
    expect(normalizeBlockProps({ height: true }, dividerDefaults).height).toBe(60)
    expect(normalizeBlockProps({ height: NaN }, dividerDefaults).height).toBe(60)
  })

  it('boolean defaults: keep booleans, default otherwise', () => {
    const defaults = { show: true }
    expect(normalizeBlockProps({ show: false }, defaults).show).toBe(false)
    expect(normalizeBlockProps({ show: 'no' }, defaults).show).toBe(true)
  })

  it('keys absent from rawProps are not injected (caller merges defaultProps)', () => {
    const out = normalizeBlockProps({ logo: 'X' }, navbarDefaults)
    expect(Object.keys(out)).toEqual(['logo'])
  })

  it('unknown keys in rawProps are preserved untouched', () => {
    const weird = { deep: { any: [1, 'x'] } }
    const out = normalizeBlockProps({ logo: 'A', extra: weird }, navbarDefaults)
    expect(out.extra).toBe(weird)
  })

  it('non-object rawProps (null, string, array) normalize to empty record', () => {
    expect(normalizeBlockProps(null, navbarDefaults)).toEqual({})
    expect(normalizeBlockProps('str', navbarDefaults)).toEqual({})
    expect(normalizeBlockProps([1, 2], navbarDefaults)).toEqual({})
  })
})
