import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { StatsBlock } from '../src/blocks/stats/StatsBlock'
import { TeamBlock } from '../src/blocks/team/TeamBlock'
import { TestimonialsBlock } from '../src/blocks/testimonials/TestimonialsBlock'
import { LogoCloudBlock } from '../src/blocks/logocloud/LogoCloudBlock'
import { validateSiteConfig } from '../src/lib/generate-site'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

// ISS-005 class fix render smokes: the highest-risk child maps. Each block
// gets a raw-crash canary (the bug class, pre-normalization) + the validated
// render (post-normalization). react-dom/server only — no new deps.

function validated(type: string, variant: string, props: Record<string, unknown>): BlockConfig {
  const config: SiteConfig = validateSiteConfig({ name: 'X', blocks: [{ type, variant, props }] })
  return config.blocks[0]
}

describe('StatsBlock render (ISS-005 class)', () => {
  it('canary: raw object item.value throws', () => {
    const raw: BlockConfig = {
      id: 's1', type: 'stats', variant: 'grid',
      props: { items: [{ value: { number: 10000 }, label: 'Sites' }] },
    }
    expect(() => renderToString(<StatsBlock block={raw} />)).toThrow()
  })

  it('validated items render coerced strings', () => {
    const block = validated('stats', 'grid', { items: [{ value: { text: '10K+' }, label: 25 }] })
    const html = renderToString(<StatsBlock block={block} />)
    expect(html).toContain('10K+')
    expect(html).toContain('>25<')
  })
})

describe('TeamBlock render (ISS-005 class)', () => {
  it('canary: raw object member.name throws', () => {
    const raw: BlockConfig = {
      id: 't1', type: 'team', variant: 'grid',
      props: { members: [{ name: { full: 'Ada' }, role: 'Eng' }] },
    }
    expect(() => renderToString(<TeamBlock block={raw} />)).toThrow()
  })

  it('validated members render coerced names', () => {
    const block = validated('team', 'grid', { members: [{ name: { label: 'Ada Byron' }, role: 'Engineer' }] })
    expect(renderToString(<TeamBlock block={block} />)).toContain('Ada Byron')
  })
})

describe('LogoCloudBlock render (ISS-005 review item 1)', () => {
  it('canary: raw object logo crashes LogoPlaceholder (name.charAt + {name} child)', () => {
    const raw: BlockConfig = {
      id: 'l1', type: 'logocloud', variant: 'default',
      props: { logos: [{ name: 'Acme', url: 'https://acme.dev' }] },
    }
    expect(() => renderToString(<LogoCloudBlock block={raw} />)).toThrow()
  })

  it('validated logos render coerced strings', () => {
    const block = validated('logocloud', 'default', { logos: [{ name: 'Acme' }, { text: 'Beta' }] })
    const html = renderToString(<LogoCloudBlock block={block} />)
    expect(html).toContain('Acme')
    expect(html).toContain('Beta')
  })
})

describe('TestimonialsBlock render (ISS-005 class)', () => {
  it('canary: raw object item.name throws — item.name.split() is the real crash site', () => {
    const raw: BlockConfig = {
      id: 'q1', type: 'testimonials', variant: 'cards',
      props: { items: [{ name: { first: 'Sarah' }, role: 'CEO', quote: 'Great' }] },
    }
    // crashes on .split of a non-string before ever reaching JSX children
    expect(() => renderToString(<TestimonialsBlock block={raw} />)).toThrow()
  })

  it('validated items render name + initials', () => {
    const block = validated('testimonials', 'cards', {
      items: [{ name: { text: 'Sarah Chen' }, role: 'CEO', quote: { label: 'Genius' }, rating: '5' }],
    })
    const html = renderToString(<TestimonialsBlock block={block} />)
    expect(html).toContain('Sarah Chen')
    expect(html).toContain('Genius')
  })
})
