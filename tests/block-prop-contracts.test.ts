import { describe, it, expect } from 'vitest'
import { validateSiteConfig } from '../src/lib/generate-site'
import { defaultTeamMembers } from '../src/lib/block-default-content'
import type { SiteConfig } from '../src/blocks/types'

// ISS-005 class fix: every array/object block prop now has a defaultProps
// contract (src/lib/block-default-content.ts), so the generic normalizer
// coerces AI drift on ALL blocks — not just navbar/footer/pricing.

function blockProps(config: SiteConfig): Record<string, unknown> {
  if (!config.pages) throw new Error('validateSiteConfig returned no pages')
  return config.pages[0].blocks[0].props
}

function doc(type: string, props: Record<string, unknown>): SiteConfig {
  return validateSiteConfig({ name: 'X', blocks: [{ type, variant: 'default', props }] })
}

describe('stats items contract', () => {
  it('coerces object values, drops non-object entries, defaults missing string', () => {
    const props = blockProps(doc('stats', {
      items: [{ value: { text: '10K+' }, label: 5 }, 'junk', { value: '99%' }],
    }))
    expect(props.items).toEqual([
      { value: '10K+', label: '5' }, // object rescued via text; number → String
      { value: '99%' }, // string kept; missing label NOT backfilled
    ])
  })

  it('all-garbage items falls back to defaultStatItems', () => {
    const props = blockProps(doc('stats', { items: ['x', null] }))
    expect(props.items).toEqual([
      { value: '10K+', label: 'Sites built' },
      { value: '99.9%', label: 'Uptime' },
      { value: '50ms', label: 'Avg. response' },
      { value: '4.9/5', label: 'User rating' },
    ])
  })
})

describe('faq items contract', () => {
  it('coerces object question/answer values', () => {
    const props = blockProps(doc('faq', {
      items: [{ question: { title: 'Q1?' }, answer: 123 }],
    }))
    expect(props.items).toEqual([{ question: 'Q1?', answer: '123' }])
  })
})

describe('team members contract', () => {
  it('coerces object names; unresolvable role falls to default-entry value', () => {
    const props = blockProps(doc('team', {
      members: [{ name: { label: 'Ada Byron' }, role: { href: '#' } }],
    }))
    expect(props.members).toEqual([{ name: 'Ada Byron', role: 'CEO & Founder' }])
  })

  it('non-array members falls back to defaultTeamMembers', () => {
    const props = blockProps(doc('team', { members: 'nope' }))
    // deep-equal, not just length: 'nope'.length === 4 would pass a raw leak
    expect(props.members).toEqual(defaultTeamMembers)
  })
})

describe('testimonials items contract', () => {
  it('coerces object name/quote and numeric-string rating (number shape)', () => {
    const props = blockProps(doc('testimonials', {
      items: [{ name: { text: 'Sarah Chen' }, quote: { label: 'Great' }, rating: '5', role: 'CEO' }],
    }))
    expect(props.items).toEqual([{ name: 'Sarah Chen', quote: 'Great', rating: 5, role: 'CEO' }])
  })
})

describe('gallery + image images contract', () => {
  it('gallery: coerces object alt/caption values', () => {
    const props = blockProps(doc('gallery', {
      images: [{ alt: { text: 'Sunset' }, caption: true }],
    }))
    expect(props.images).toEqual([{ alt: 'Sunset', caption: 'true' }])
  })

  it('image grid: coerces object src values', () => {
    const props = blockProps(doc('image', {
      images: [{ src: { text: 'a.png' }, alt: 7 }],
    }))
    expect(props.images).toEqual([{ src: 'a.png', alt: '7' }])
  })
})

describe('logocloud logos contract (ISS-005 review item 1)', () => {
  it('coerces object logo entries via name/text fields', () => {
    const props = blockProps(doc('logocloud', {
      logos: [{ name: 'Acme' }, { text: 'Beta' }, 'Plain', { href: '#' }],
    }))
    expect(props.logos).toEqual(['Acme', 'Beta', 'Plain']) // unresolvable dropped
  })

  it('all-garbage logos falls back to defaultLogos', () => {
    const props = blockProps(doc('logocloud', { logos: [{ href: '#' }, null] }))
    expect(props.logos).toEqual(['Vercel', 'Stripe', 'GitHub', 'Figma', 'Notion', 'Linear'])
  })
})

describe('hero badge contract (ISS-005 review item 1)', () => {
  it('coerces object/number badge values against the string shape', () => {
    const props = blockProps(doc('hero', { badge: { text: 'Now in Beta' } }))
    expect(props.badge).toBe('Now in Beta')
    expect(blockProps(doc('hero', { badge: 42 })).badge).toBe('42')
    // unresolvable object → default '' → badge div stays hidden (falsy guard)
    expect(blockProps(doc('hero', { badge: { href: '#' } })).badge).toBe('')
  })
})

describe('banner string contract', () => {
  it('coerces number text and unresolvable linkUrl object to default', () => {
    const props = blockProps(doc('banner', { text: 42, linkUrl: { href: '#' } }))
    expect(props.text).toBe('42')
    expect(props.linkUrl).toBe('#') // string default is '#' from defaultProps
  })
})
