/**
 * Phase 04 — footer link objects must never export as `[object Object]`.
 *
 * The link-array model change means a footer `links` / `columns[].links` value
 * may now hold `{label,href}` objects. The exporter has no anchors yet (phase 05
 * owns that), so the non-anchor emitters collapse each entry to its label via
 * `linkLabel`. Two reachable paths are covered:
 *   (a) editor URL-typing — the panel promotes a string item to `{label,href}`;
 *   (b) AI-generation — the normalizer now preserves `{label,href}` objects.
 * Legacy string-only configs must stay byte-identical.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import { validateSiteConfig } from '../src/lib/generate-site'
import type { SiteConfig } from '../src/blocks/types'

const FOOTER_SIMPLE_SPAN =
  '<span class="text-[12px] text-text-3 hover:text-text-1 transition-colors cursor-pointer">'

function footerConfig(variant: string, props: Record<string, unknown>): SiteConfig {
  return { name: 'Site', blocks: [{ id: 'f1', type: 'footer', variant, props }] }
}

describe('footer exporter — object link entries collapse to labels', () => {
  it('simple footer: editor-typed {label,href} links render as labels, never [object Object]', () => {
    const html = exportSiteToHTML(
      footerConfig('simple', {
        logo: 'Brand',
        copyright: '© 2026',
        links: [{ label: 'Privacy', href: '/privacy' }, 'Terms'],
      }),
    )
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('>Privacy<')
    expect(html).toContain('>Terms<')
  })

  it('multi-column footer: nested columns[].links and bottom links collapse to labels', () => {
    const html = exportSiteToHTML(
      footerConfig('multi-column', {
        logo: 'Brand',
        copyright: '© 2026',
        links: [{ label: 'Privacy', href: '/p' }],
        columns: [{ title: 'Product', links: [{ label: 'Docs', href: '/docs' }] }],
      }),
    )
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('>Docs<')
    expect(html).toContain('>Privacy<')
  })

  it('minimal footer: object links collapse to labels', () => {
    const html = exportSiteToHTML(
      footerConfig('minimal', { copyright: '© 2026', links: [{ label: 'Terms', href: '/t' }] }),
    )
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('>Terms<')
  })

  it('AI-generation path: reference config → validateSiteConfig → export stays free of [object Object]', () => {
    const config = validateSiteConfig(
      {
        name: 'Site',
        blocks: [
          {
            type: 'footer',
            variant: 'multi-column',
            props: { columns: [{ title: 'Product', links: [{ label: 'Docs', href: '/docs' }] }] },
          },
        ],
      },
      'acme site',
    )
    const html = exportSiteToHTML(config)
    expect(html).not.toContain('[object Object]')
    expect(html).toContain('>Docs<')
  })

  it('legacy string-only footer links export byte-identically', () => {
    const html = exportSiteToHTML(
      footerConfig('simple', { logo: 'Brand', copyright: '© 2026', links: ['Privacy', 'Terms'] }),
    )
    expect(html).toContain(`${FOOTER_SIMPLE_SPAN}Privacy</span>`)
    expect(html).toContain(`${FOOTER_SIMPLE_SPAN}Terms</span>`)
  })
})
