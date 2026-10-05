/**
 * ISS-005 — the editor-side `BannerBlock` anchor must be policy-gated.
 *
 * `BannerBlock` rendered `<a href={linkUrl}>` with no scheme check while its
 * siblings (navbar, footer, pricing) all routed hrefs through `isAllowedUrl`.
 * A `javascript:` value here executes on click inside the EDITOR's own
 * authenticated origin — a worse position than the exported site, and the same
 * defect class as ISS-001.
 *
 * Both variants are covered because the component emits the anchor twice.
 */
import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { BannerBlock } from '../src/blocks/banner/BannerBlock'
import type { BlockConfig } from '../src/blocks/types'

const banner = (linkUrl: string, variant: 'bar' | 'ribbon'): BlockConfig => ({
  id: 'banner-1',
  type: 'banner',
  variant,
  props: { text: 'Announcement', linkText: 'Read more', linkUrl },
})

const VARIANTS = ['bar', 'ribbon'] as const

const DENIED = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  '//evil.example',
]

const ALLOWED = ['https://example.com/read', '#pricing', '/about', 'mailto:a@b.com']

describe('BannerBlock URL policy (ISS-005)', () => {
  for (const variant of VARIANTS) {
    it(`[${variant}] never emits a denied scheme`, () => {
      for (const url of DENIED) {
        const html = renderToString(<BannerBlock block={banner(url, variant)} />)
        expect(html).not.toContain('javascript:')
        expect(html).not.toContain('vbscript:')
        expect(html).not.toContain('data:text/html')
        // Degrades to the same inert href a missing linkUrl already produced.
        expect(html).toContain('href="#"')
      }
    })

    it(`[${variant}] still emits an allowed URL unchanged`, () => {
      for (const url of ALLOWED) {
        const html = renderToString(<BannerBlock block={banner(url, variant)} />)
        expect(html).toContain(`href="${url}"`)
      }
    })

    it(`[${variant}] renders no anchor when there is no link text`, () => {
      const block: BlockConfig = {
        id: 'banner-2',
        type: 'banner',
        variant,
        props: { text: 'Announcement', linkUrl: 'https://example.com' },
      }
      expect(renderToString(<BannerBlock block={block} />)).not.toContain('<a ')
    })
  }
})
