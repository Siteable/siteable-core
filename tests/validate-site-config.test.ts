import { describe, it, expect } from 'vitest'
import { validateSiteConfig, generateSiteConfig } from '../src/lib/generate-site'
import type { SiteConfig } from '../src/blocks/types'

// ISS-005: AI (Gemini) returned navbar links as {label,href} objects; validateBlock
// spread raw props without checking values, so NavbarBlock crashed on render.

function docWithNavbarProps(props: Record<string, unknown>): unknown {
  return { name: 'Acme', blocks: [{ type: 'navbar', variant: 'default', props }] }
}

function firstBlockProps(config: SiteConfig): Record<string, unknown> {
  // pages is optional on SiteConfig; every doc in these tests has valid blocks,
  // so a missing pages array means validateSiteConfig regressed — fail loud.
  if (!config.pages) throw new Error('validateSiteConfig returned no pages')
  return config.pages[0].blocks[0].props
}

describe('validateSiteConfig — ISS-005 prop normalization', () => {
  it('THE regression core: object navbar links preserve {label,href}', () => {
    const config = validateSiteConfig(
      docWithNavbarProps({ links: [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }] }),
      'acme saas site',
    )
    expect(firstBlockProps(config).links).toEqual([{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }])
  })

  it('ISS-005 exact Gemini shape via full pages doc', () => {
    const raw = {
      name: 'Acme',
      pages: [{
        id: 'page-home', name: 'Home', path: '/',
        blocks: [{
          id: 'block-navbar-1', type: 'navbar', variant: 'default',
          props: {
            logo: { text: 'Acme', href: '/' },
            links: [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }, 'Plain'],
            ctaText: 42,
          },
        }],
      }],
    }
    const props = firstBlockProps(validateSiteConfig(raw))
    expect(props).toEqual({
      logo: 'Acme',
      links: [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }, 'Plain'],
      ctaText: '42',
      ctaUrl: '',
    })
  })

  it('mixed valid+garbage links drop garbage; all-garbage falls back to defaults', () => {
    const mixed = firstBlockProps(validateSiteConfig(docWithNavbarProps({ links: ['A', { href: '#x' }, null] })))
    expect(mixed.links).toEqual(['A'])

    const garbage = firstBlockProps(validateSiteConfig(docWithNavbarProps({ links: [{ a: 1 }, null] })))
    expect(garbage.links).toEqual(['Features', 'Pricing', 'About'])
  })

  it('non-array links falls back to defaults; string logo numbers coerce', () => {
    const props = firstBlockProps(validateSiteConfig(docWithNavbarProps({ links: 'Home', logo: 7 })))
    expect(props.links).toEqual(['Features', 'Pricing', 'About'])
    expect(props.logo).toBe('7')
  })

  it('footer columns: array-of-objects with nested object links normalize recursively', () => {
    const config = validateSiteConfig({
      name: 'Site',
      blocks: [{
        type: 'footer', variant: 'multi-column',
        props: {
          logo: 'Acme', copyright: '2026', links: [{ label: 'Privacy' }],
          columns: [
            { title: 'Product', links: [{ label: 'Features', href: '/f' }, 'Changelog'] },
            { title: 'Company', links: [] },
          ],
        },
      }],
    })
    const props = firstBlockProps(config)
    expect(props.links).toEqual([{ label: 'Privacy' }])
    // nested link array: items preserved shape-preserving; empty links falls back to the default entry's links
    expect(props.columns).toEqual([
      { title: 'Product', links: [{ label: 'Features', href: '/f' }, 'Changelog'] },
      { title: 'Company', links: ['Features', 'Pricing', 'Changelog', 'Roadmap'] },
    ])
  })

  it('pricing tiers with object features coerce to strings', () => {
    const config = validateSiteConfig({
      name: 'Site',
      blocks: [{
        type: 'pricing', variant: 'simple',
        props: {
          title: 'Pricing',
          tiers: [{
            name: 'Pro', price: { text: '$19' }, period: '/mo',
            features: [{ label: 'Unlimited sites' }, 'SSO', { href: '#' }],
            cta: 'Buy', featured: true,
          }],
        },
      }],
    })
    const tiers = firstBlockProps(config).tiers as Record<string, unknown>[]
    expect(tiers[0].price).toBe('$19')
    expect(tiers[0].features).toEqual(['Unlimited sites', 'SSO'])
    expect(tiers[0].featured).toBe(true) // key outside first default entry — preserved
  })

  it('unknown extra prop keys are preserved untouched', () => {
    const extra = { anything: [1, 'x'] }
    const props = firstBlockProps(validateSiteConfig(docWithNavbarProps({ extraKey: extra })))
    expect(props.extraKey).toBe(extra)
    expect(props.logo).toBe('Brand') // missing known keys still filled from defaults
  })

  it('does not throw on hostile shapes; falls back to a template', () => {
    expect(() => validateSiteConfig({ blocks: [null, 'x', 42] })).not.toThrow()
    expect(() => validateSiteConfig({ pages: [null], blocks: 'nope' })).not.toThrow()
    expect(() => validateSiteConfig('garbage')).not.toThrow()
    // all blocks invalid → template fallback with real blocks
    const config = validateSiteConfig({ blocks: [{ type: 'bogus' }] }, 'portfolio dev site')
    expect(config.blocks.length).toBeGreaterThan(0)
  })
})

describe('generateSiteConfig — tier-2 onServerFallback validation (ISS-005 hole)', () => {
  it('normalizes object-links config returned by the host fallback', async () => {
    localStorage.removeItem('openpage-gemini-key')
    const raw: SiteConfig = {
      name: 'Acme',
      pages: [{
        id: 'page-home', name: 'Home', path: '/',
        blocks: [{
          id: 'b1', type: 'navbar', variant: 'default',
          // server returned contract-violating props — must not reach the canvas raw
          props: { links: [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }] } as unknown as Record<string, unknown>,
        }],
      }],
      blocks: [],
    }
    const result = await generateSiteConfig('acme site', undefined, async () => raw)
    expect(result.source).toBe('ai')
    expect(firstBlockProps(result.config).links).toEqual([{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }])
  })

  // ISS-005 review item 4 — private repo E2E-01-002 depends on this contract
  it('propagates AbortError from the host fallback unchanged (no template swallow)', async () => {
    localStorage.removeItem('openpage-gemini-key')
    const abort = new Error('The user aborted a request.')
    abort.name = 'AbortError'
    // strict identity: the SAME error object must surface, not a template result
    await expect(
      generateSiteConfig('acme site', undefined, async () => { throw abort }),
    ).rejects.toBe(abort)
  })

  it('falls through to template when the host fallback throws', async () => {
    localStorage.removeItem('openpage-gemini-key')
    const result = await generateSiteConfig('acme site', undefined, async () => {
      throw new Error('server 500')
    })
    expect(result.source).toBe('template')
  })
})

// Generators (including third-party ones driving Google AI Studio) emit props
// flattened onto the block object — `{ type: "hero", headline: "..." }` — matching
// the flat form our own GENERATION_PROMPT illustrates. validateBlock read only
// `raw.props`, so every block fell back to defaultProps: the import "succeeded"
// and produced an English demo site with zero of the authored copy.
describe('validateSiteConfig — flattened (inline) block props', () => {
  it('keeps authored copy when props are flattened onto the block', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      blocks: [{
        id: 'hero-1', type: 'hero', variant: 'centered',
        badge: 'sample badge',
        headline: 'authored headline',
        subheadline: 'authored subheadline',
        primaryCta: 'authored primary cta',
        secondaryCta: 'authored secondary cta',
      }],
    })
    expect(firstBlockProps(config)).toEqual({
      badge: 'sample badge',
      headline: 'authored headline',
      subheadline: 'authored subheadline',
      primaryCta: 'authored primary cta',
      secondaryCta: 'authored secondary cta',
    })
  })

  it('never leaks block meta keys (id/type/variant/props) into props', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      blocks: [{ id: 'block-hero-1', type: 'hero', variant: 'gradient', headline: 'authored headline' }],
    })
    const props = firstBlockProps(config)
    expect(props).not.toHaveProperty('id')
    expect(props).not.toHaveProperty('type')
    expect(props).not.toHaveProperty('variant')
    expect(props).not.toHaveProperty('props')
  })

  it('nested props win over flattened ones when both are present', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      blocks: [{ type: 'hero', headline: 'flattened', props: { headline: 'nested' } }],
    })
    expect(firstBlockProps(config).headline).toBe('nested')
  })

  it('a bare block with only meta keys still yields defaultProps', () => {
    const config = validateSiteConfig({ name: 'Sample', blocks: [{ id: 'x', type: 'hero', variant: 'split' }] })
    expect(firstBlockProps(config).headline).toBe('Your Headline Here')
  })

  it('inline nested shapes survive (features items, faq, footer columns)', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      blocks: [
        {
          id: 'f1', type: 'features', variant: 'list', label: 'sample label', title: 'authored title',
          items: [{ icon: 'Layers', title: 'item title', description: 'item description' }],
        },
        {
          id: 'q1', type: 'faq', variant: 'accordion', title: 'authored faq title',
          items: [{ question: 'authored question', answer: 'authored answer' }],
        },
        {
          id: 'ft1', type: 'footer', variant: 'multi-column', logo: 'Sample',
          copyright: 'copyright text',
          columns: [{ title: 'authored column', links: ['Link one', 'Link two'] }],
        },
      ],
    })
    const blocks = config.pages![0].blocks
    expect(blocks[0].props.items).toEqual([
      { icon: 'Layers', title: 'item title', description: 'item description' },
    ])
    expect(blocks[0].props.title).toBe('authored title')
    expect(blocks[1].props.items).toEqual([
      { question: 'authored question', answer: 'authored answer' },
    ])
    expect((blocks[2].props.columns as { title: string }[])[0].title).toBe('authored column')
  })

  it('inline props inside a multi-page doc keep their page assignment', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      pages: [
        { id: 'page-home', name: 'Home', path: '/', blocks: [
          { id: 'h', type: 'hero', variant: 'centered', headline: 'home headline' },
        ] },
        { id: 'page-two', name: 'Two', path: '/two', blocks: [
          { id: 'c', type: 'contact', variant: 'form', title: 'two title' },
        ] },
      ],
    })
    expect(config.pages![0].blocks[0].props.headline).toBe('home headline')
    expect(config.pages![1].blocks[0].props.title).toBe('two title')
  })
  it('flattened link objects survive on navbar and footer columns', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      blocks: [
        { id: 'n', type: 'navbar', logo: 'Sample', links: [{ label: 'Pricing', href: '/pricing' }] },
        { id: 'f', type: 'footer', variant: 'multi-column', columns: [{ title: 'Site', links: [{ label: 'About', href: '/about' }] }] },
      ],
    })
    const blocks = config.pages![0].blocks
    expect(blocks[0].props.links).toEqual([{ label: 'Pricing', href: '/pricing' }])
    expect((blocks[1].props.columns as { links: unknown[] }[])[0].links).toEqual([{ label: 'About', href: '/about' }])
  })

  it('an array `props` is ignored rather than spread as index keys', () => {
    const config = validateSiteConfig({ name: 'Sample', blocks: [{ type: 'hero', props: [1, 2], headline: 'flat' }] })
    const props = firstBlockProps(config)
    expect(props).not.toHaveProperty('0')
    expect(props.headline).toBe('flat')
  })

  it('documented optional flat props survive; unknown flat keys are dropped', () => {
    const config = validateSiteConfig({
      name: 'Sample',
      blocks: [{
        type: 'hero', headline: 'h', primaryCtaUrl: 'https://example.com',
        locked: true, name: 'x', style: { a: 1 }, pageId: 'p',
      }],
    })
    const props = firstBlockProps(config)
    expect(props.primaryCtaUrl).toBe('https://example.com')
    for (const stray of ['locked', 'name', 'style', 'pageId']) expect(props).not.toHaveProperty(stray)
  })

  it('unknown keys inside nested props are still kept (editor patches add keys)', () => {
    const config = validateSiteConfig({ name: 'Sample', blocks: [{ type: 'hero', props: { headline: 'h', customKey: 1 } }] })
    expect(firstBlockProps(config).customKey).toBe(1)
  })
})
