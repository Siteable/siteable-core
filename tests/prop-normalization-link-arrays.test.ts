import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToString } from 'react-dom/server'
import { NavbarBlock } from '../src/blocks/navbar/NavbarBlock'
import { validateSiteConfig } from '../src/lib/generate-site'
import { normalizeBlockProps } from '../src/lib/prop-normalization'
import { blockMetadata } from '../src/lib/block-metadata'

// Phase 04 — link-array contract (FR-003, NF-005; SC-017, SC-018, SC-024).
//
// Mirrors src/lib/block-metadata navbar defaultProps (plus the phase-04 ctaUrl).
const navbarDefaults = { logo: 'Brand', links: ['Features', 'Pricing', 'About'], ctaText: 'Get Started' }

describe('SC-017 — link arrays survive validation and render in the editor', () => {
  it('navbar {label,href} objects round-trip through validateSiteConfig and render as labels', () => {
    const objectLinks = [
      { label: 'Home', href: 'https://x/home' },
      { label: 'Pricing', href: 'https://x/p' },
    ]
    const config = validateSiteConfig(
      { name: 'Acme', blocks: [{ type: 'navbar', variant: 'default', props: { links: objectLinks } }] },
      'acme site',
    )
    const block = config.blocks[0]
    // The two objects survive (deep-equal, hrefs verbatim).
    expect(block.props.links).toEqual(objectLinks)

    const html = renderToString(createElement(NavbarBlock, { block }))
    expect(html).toContain('Home')
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('href="https://x/home"')
  })

  it('nested footer columns[].links objects survive (skip-set plumbing)', () => {
    const config = validateSiteConfig({
      name: 'Site',
      blocks: [{
        type: 'footer', variant: 'multi-column',
        props: { columns: [{ title: 'Product', links: [{ label: 'Docs', href: '/docs' }] }] },
      }],
    })
    const columns = config.blocks[0].props.columns as Array<Record<string, unknown>>
    expect(columns[0].links).toEqual([{ label: 'Docs', href: '/docs' }])
  })
})

describe('SC-018 — hrefs preserved verbatim', () => {
  it('an href with a query string survives validation unchanged', () => {
    const config = validateSiteConfig({
      name: 'Site',
      blocks: [{ type: 'navbar', variant: 'default', props: { links: [{ label: 'Q', href: '/search?a=1&b=2' }] } }],
    })
    expect(config.blocks[0].props.links).toEqual([{ label: 'Q', href: '/search?a=1&b=2' }])
  })

  it('legacy string link arrays are unchanged', () => {
    const config = validateSiteConfig({
      name: 'Site',
      blocks: [{ type: 'navbar', variant: 'default', props: { links: ['A', 'B'] } }],
    })
    expect(config.blocks[0].props.links).toEqual(['A', 'B'])
  })

  it('all-garbage link array falls back to the navbar defaults', () => {
    const config = validateSiteConfig({
      name: 'Site',
      blocks: [{ type: 'navbar', variant: 'default', props: { links: [{ href: '#' }, null] } }],
    })
    expect(config.blocks[0].props.links).toEqual(['Features', 'Pricing', 'About'])
  })
})

describe('normalizeBlockProps — 3rd linkArrays argument', () => {
  it('declared link path preserves objects; the same 2-arg call collapses to labels', () => {
    expect(normalizeBlockProps({ links: [{ label: 'Home', href: '#' }] }, navbarDefaults, ['links']).links)
      .toEqual([{ label: 'Home', href: '#' }])
    // 2-arg back-compat: undeclared string[] contract still collapses the object.
    expect(normalizeBlockProps({ links: [{ label: 'Home', href: '#' }] }, navbarDefaults).links)
      .toEqual(['Home'])
  })

  it('the skip-set is path-aware: a non-declared nested `links` still collapses', () => {
    // Only the ROOT `links` is declared. A nested `columns[].links` is NOT a
    // declared link path, so the shape pass must still collapse its objects —
    // proving the skip keys on the full path, not the bare segment name.
    const defaults = { links: ['Root'], columns: [{ links: ['a'] }] }
    const raw = {
      links: ['Root'],
      columns: [{ links: [{ label: 'Nested', href: '/n' }] }],
    }
    const result = normalizeBlockProps(raw, defaults, ['links'])
    expect(result.links).toEqual(['Root'])
    expect((result.columns as Array<Record<string, unknown>>)[0].links).toEqual(['Nested'])
  })

  it('does not inject a default for an absent declared link path (non-injection contract holds)', () => {
    // JSDoc: "Keys missing from rawProps are NOT injected — the caller merges
    // defaultProps." The link pass must honour that for declared paths too.
    const result = normalizeBlockProps({ logo: 'X' }, navbarDefaults, ['links'])
    expect('links' in result).toBe(false)
  })

  it('a bracket-less nested path is canonicalized so the skip-set still matches', () => {
    // `columns.links` (no `[]`) must behave identically to `columns[].links`;
    // otherwise the link pass preserves the objects while the shape pass
    // re-collapses them — a silent shape loss.
    const defaults = { columns: [{ title: 'P', links: ['a'] }] }
    const raw = { columns: [{ title: 'P', links: [{ label: 'N', href: '/n' }] }] }
    const result = normalizeBlockProps(raw, defaults, ['columns.links'])
    expect((result.columns as Array<Record<string, unknown>>)[0].links).toEqual([{ label: 'N', href: '/n' }])
  })
})

describe('SC-024 — NF-005: no block-name literals in the normalizer source', () => {
  it('the normalizer module source contains no BlockType member as a word', () => {
    // Anchored to this file (NOT process.cwd()) so the scan is location-independent.
    const sourcePath = join(import.meta.dirname, '..', 'src', 'lib', 'prop-normalization.ts')
    const source = readFileSync(sourcePath, 'utf8')
    for (const { type } of blockMetadata) {
      const token = new RegExp(`\\b${type}\\b`)
      expect(source, `block type literal "${type}" found in prop-normalization.ts`).not.toMatch(token)
    }
  })
})
