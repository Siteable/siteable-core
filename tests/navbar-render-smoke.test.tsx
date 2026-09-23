import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { NavbarBlock } from '../src/blocks/navbar/NavbarBlock'
import { validateSiteConfig } from '../src/lib/generate-site'
import type { BlockConfig } from '../src/blocks/types'

// ISS-005 render smoke: proves the original crash and that the validated
// (normalized) config renders clean. react-dom/server only — no new deps.

const OBJECT_LINKS = [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }]

describe('NavbarBlock render smoke (ISS-005)', () => {
  it('documents the crash: RAW object-links props throw in renderToString', () => {
    // This IS ISS-005: React refuses {label,href} objects as children
    // ("Objects are not valid as a React child"). Kept as a canary that the
    // bug class is real — the fix must prevent props like this ever reaching
    // a block, not make React accept them.
    const rawBlock: BlockConfig = {
      id: 'b1', type: 'navbar', variant: 'default',
      props: { logo: 'Acme', links: OBJECT_LINKS, ctaText: 'Go' },
    }
    expect(() => renderToString(<NavbarBlock block={rawBlock} />)).toThrow()
  })

  it('validated config renders without throwing and shows the labels', () => {
    const config = validateSiteConfig(
      { name: 'Acme', blocks: [{ type: 'navbar', variant: 'default', props: { links: OBJECT_LINKS } }] },
      'acme site',
    )
    const html = renderToString(<NavbarBlock block={config.blocks[0]} />)
    expect(html).toContain('Home')
    expect(html).toContain('Pricing')
    expect(html).not.toContain('[object Object]')
  })

  it('centered variant renders the normalized defaults after all-garbage links', () => {
    const config = validateSiteConfig(
      { name: 'Acme', blocks: [{ type: 'navbar', variant: 'centered', props: { links: [{ href: '#' }] } }] },
      'acme site',
    )
    const html = renderToString(<NavbarBlock block={config.blocks[0]} />)
    expect(html).toContain('Features')
  })
})
