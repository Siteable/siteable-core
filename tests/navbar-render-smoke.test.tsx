import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { NavbarBlock } from '../src/blocks/navbar/NavbarBlock'
import { LogoCloudBlock } from '../src/blocks/logocloud/LogoCloudBlock'
import { validateSiteConfig } from '../src/lib/generate-site'
import type { BlockConfig } from '../src/blocks/types'

// ISS-005 render smoke. Phase 04 reverses the navbar contract: declared link
// arrays ({label,href}) now render as labels instead of crashing, so the old
// crash canary moved to a block whose array-of-objects prop is NOT declared as
// a link array (logocloud.logos) — that bug class still exists.

const OBJECT_LINKS = [{ label: 'Home', href: '#' }, { label: 'Pricing', href: '#p' }]

describe('NavbarBlock render smoke (ISS-005)', () => {
  it('NEW contract: RAW object-links props render as labels, no [object Object]', () => {
    // Phase 04: navbar declares `links` as a link array, so a RAW {label,href}
    // prop renders each item's label. It must not reach React as an object child.
    const rawBlock: BlockConfig = {
      id: 'b1', type: 'navbar', variant: 'default',
      props: { logo: 'Acme', links: OBJECT_LINKS, ctaText: 'Go' },
    }
    const html = renderToString(<NavbarBlock block={rawBlock} />)
    expect(html).toContain('Home')
    expect(html).toContain('Pricing')
    expect(html).not.toContain('[object Object]')
  })

  it('crash canary: a NON-declared object array still throws (logocloud.logos)', () => {
    // The bug class (object rendered as a React child) is real; the phase-04 fix
    // narrows it to declared link arrays, it does not make React accept objects.
    expect(() =>
      renderToString(
        <LogoCloudBlock
          block={{ id: 'l', type: 'logocloud', variant: 'default', props: { logos: [{ name: 'Acme' }] } }}
        />,
      ),
    ).toThrow()
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
