/**
 * Hostile strings reaching the structured-data script must never close it,
 * open a comment, or lose information on the way through the serializer.
 */
import { describe, it, expect } from 'vitest'
import { exportSiteToHTML } from '../src/lib/export-html'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const LONG = 'A'.repeat(20000) + '</script>'

const PAYLOADS: Array<[string, string]> = [
  ['close tag', '</script>'],
  ['upper close tag with space', '</SCRIPT >'],
  ['mixed case close tag', '</ScRiPt\t>'],
  ['close tag with attribute', '</script foo="bar">'],
  ['comment open', '<!--'],
  ['comment open then script', '<!-- <script>'],
  ['comment close', '-->'],
  ['bang comment close', '--!>'],
  ['cdata close', ']]>'],
  ['line separator', 'a\u2028b'],
  ['paragraph separator', 'a\u2029b'],
  ['quote and backslash', '"\\"\\\\'],
  ['close tag then markup', '</script><b>x</b>'],
  ['img onerror', '<img src=x onerror=alert(1)>'],
  ['nul byte', 'a\u0000b'],
  ['lone high surrogate', 'a\ud800b'],
  ['lone low surrogate', 'a\udc00b'],
  ['very long', LONG],
  ['entity encoded close tag', '&lt;/script&gt;'],
  ['ampersand', 'a & b &amp; c'],
  ['nested open script', '<script>alert(1)</script>'],
  ['newline split close tag', '</scr\nipt>'],
  ['control chars', 'a\u0001\u001f\u007fb'],
  ['unicode escapes literal', '\\u003c/script\\u003e'],
]

const block = (type: string, props: Record<string, unknown>): BlockConfig =>
  ({ id: type, type, props }) as unknown as BlockConfig

function ldBlocks(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  )
}

function assertInert(html: string): string {
  const blocks = ldBlocks(html)
  expect(blocks).toHaveLength(1)
  const body = blocks[0]
  expect(body.toLowerCase()).not.toContain('</script')
  expect(body).not.toContain('<!--')
  expect(body).not.toContain('<')
  expect(body).not.toContain('>')
  // The document still has exactly the scripts it would have had: the JSON-LD
  // block adds one opening and one closing tag and nothing else.
  const opens = (html.match(/<script\b/gi) ?? []).length
  const closes = (html.match(/<\/script/gi) ?? []).length
  expect(opens).toBe(closes)
  return body
}

function graph(html: string): Array<Record<string, any>> {
  return JSON.parse(assertInert(html))['@graph']
}

describe('json-ld with hostile strings', () => {
  it('has at least 20 payloads', () => {
    expect(PAYLOADS.length).toBeGreaterThanOrEqual(20)
  })

  describe.each(PAYLOADS)('%s', (_label, payload) => {
    const value = payload.trim()

    it('site name round-trips', () => {
      const html = exportSiteToHTML({ name: 'Site', blocks: [] } as SiteConfig, {
        settings: { siteName: payload },
      })
      const g = graph(html)
      expect(g[0].name).toBe(value)
      expect(g[1].name).toBe(value)
    })

    it('config name fallback round-trips', () => {
      const html = exportSiteToHTML({ name: payload, blocks: [] } as SiteConfig)
      expect(graph(html)[0].name).toBe(value)
    })

    it('faq question and answer round-trip', () => {
      const cfg = {
        name: 'Site',
        blocks: [block('faq', { items: [{ question: payload + 'q', answer: payload + 'a' }] })],
      } as SiteConfig
      const faq = graph(exportSiteToHTML(cfg)).find((n) => n['@type'] === 'FAQPage')!
      expect(faq.mainEntity[0].name).toBe((payload + 'q').trim())
      expect(faq.mainEntity[0].acceptedAnswer.text).toBe((payload + 'a').trim())
    })

    it('logo image is either dropped or round-trips', () => {
      const url = 'https://cdn.example/' + payload
      const cfg = {
        name: 'Site',
        blocks: [block('navbar', { logo: 'x', logoImage: url })],
      } as SiteConfig
      const org = graph(exportSiteToHTML(cfg, { siteUrl: 'https://a.example' }))[0]
      if (org.logo !== undefined) expect(org.logo).toBe(url)
    })

    it('site url is dropped or stays a bare origin', () => {
      const html = exportSiteToHTML({ name: 'Site', blocks: [] } as SiteConfig, {
        siteUrl: 'https://a.example' + payload,
      })
      const org = graph(html)[0]
      if (org.url !== undefined) expect(org.url).toMatch(/^https?:\/\/[^/<>"\s]+$/)
    })

    it('all fields at once stay inert', () => {
      const cfg = {
        name: payload,
        blocks: [
          block('navbar', { logo: payload, logoImage: 'https://cdn.example/' + payload }),
          block('faq', { items: [{ question: payload, answer: payload }] }),
        ],
      } as SiteConfig
      const html = exportSiteToHTML(cfg, {
        settings: { siteName: payload },
        siteUrl: 'https://a.example',
      })
      const g = graph(html)
      expect(g[0].name).toBe(value)
    })
  })
})
