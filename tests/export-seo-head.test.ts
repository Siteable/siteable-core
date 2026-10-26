import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportSiteToHTML } from '../src/lib/export-html'
import { exportSitePages } from '../src/lib/export-site-pages'
import {
  normalizeSiteUrl,
  renderCanonical,
  renderTwitterMeta,
  renderJsonLd,
  renderFontLinks,
} from '../src/lib/export-seo-head'
import { themePresets } from '../src/lib/theme-presets'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const block = (type: string, props: Record<string, unknown> = {}, id = type): BlockConfig =>
  ({ id, type, props }) as unknown as BlockConfig
const site = (blocks: BlockConfig[], extra: Partial<SiteConfig> = {}): SiteConfig =>
  ({ name: 'Site', blocks, ...extra }) as SiteConfig

function jsonLd(html: string): { '@graph': Array<Record<string, any>> } {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
  expect(m).not.toBeNull()
  return JSON.parse(m![1])
}

describe('normalizeSiteUrl', () => {
  const table: Array<[unknown, string]> = [
    ['https://a.example', 'https://a.example'],
    ['http://a.example', 'http://a.example'],
    ['https://a.example/', 'https://a.example'],
    ['  https://a.example  ', 'https://a.example'],
    ['https://A.Example', 'https://a.example'],
    ['https://a.example:443', 'https://a.example'],
    ['https://a.example:8443', 'https://a.example:8443'],
    [undefined, ''],
    ['', ''],
    [42, ''],
    ['javascript:x', ''],
    ['ftp://a.example', ''],
    ['https://u:p@a.example', ''],
    ['https://u@a.example', ''],
    ['https://a.example/x', ''],
    ['https://a.example/x?y', ''],
    ['https://a.example?y=1', ''],
    ['https://a.example#f', ''],
    ['not a url', ''],
    ['HTTPS://A.Example', 'https://a.example'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['https://[::1]', 'https://[::1]'],
    ['https://a.example/.', ''],
    ['https://a.example/..', ''],
    ['https://a.example/./', ''],
    ['https://a.example/%2e', ''],
    ['https://a.example\\', ''],
    ['https://@a.example', ''],
    ['https://:@a.example', ''],
    ['https:a.example', ''],
    ['https:/a.example', ''],
    ['https://a.ex"ample', ''],
    ["https://a.ex'ample", ''],
    ['https://a.ex<ample', ''],
    ['https://a.ex ample', ''],
    ['https://', ''],
    ['https://a.example//', ''],
  ]
  it.each(table)('%j -> %j', (raw, expected) => {
    expect(normalizeSiteUrl(raw)).toBe(expected)
  })
})

describe('canonical link', () => {
  it('is absent without a valid site url', () => {
    expect(exportSiteToHTML(site([]))).not.toContain('rel="canonical"')
    expect(exportSiteToHTML(site([]), { siteUrl: 'javascript:x' })).not.toContain('canonical')
  })
  it('uses the origin plus the page path', () => {
    expect(renderCanonical('https://a.example', '/about')).toContain(
      'href="https://a.example/about"',
    )
    expect(exportSiteToHTML(site([]), { siteUrl: 'https://a.example/' })).toContain(
      '<link rel="canonical" href="https://a.example/" />',
    )
  })
  it('escapes the page path', () => {
    expect(renderCanonical('https://a.example', '/a"b')).not.toContain('a"b')
  })
  it('differs per page in a multi-page export', () => {
    const cfg = site([], {
      pages: [
        { id: 'p1', name: 'Home', path: '/', blocks: [] },
        { id: 'p2', name: 'About', path: '/about', blocks: [] },
      ],
    } as Partial<SiteConfig>)
    const docs = exportSitePages(cfg, { siteUrl: 'https://a.example' })
    expect(docs[0].html).toContain('href="https://a.example/"')
    expect(docs[1].html).toContain('href="https://a.example/about"')
  })
})

describe('twitter meta', () => {
  it('uses the large card only with an image', () => {
    const withImg = renderTwitterMeta({ title: 'T', description: 'D', image: 'https://i.example/a.png' })
    expect(withImg).toContain('content="summary_large_image"')
    expect(withImg).toContain('twitter:image')
    expect(withImg).toContain('twitter:description')
    const bare = renderTwitterMeta({ title: 'T', description: '', image: '' })
    expect(bare).toContain('content="summary"')
    expect(bare).not.toContain('twitter:image')
    expect(bare).not.toContain('twitter:description')
    expect(bare).toContain('twitter:title')
  })
  it('shares the image value with og:image', () => {
    const html = exportSiteToHTML(site([]), { settings: { ogImageUrl: 'https://i.example/a.png' } })
    expect(html).toContain('<meta property="og:image" content="https://i.example/a.png" />')
    expect(html).toContain('<meta name="twitter:image" content="https://i.example/a.png" />')
  })
  it('drops both images when the url policy rejects it', () => {
    const html = exportSiteToHTML(site([]), { settings: { ogImageUrl: 'javascript:alert(1)' } })
    expect(html).not.toContain('og:image')
    expect(html).not.toContain('twitter:image')
    expect(html).toContain('content="summary"')
  })
  it('escapes text', () => {
    expect(renderTwitterMeta({ title: '"><b>', description: '', image: '' })).not.toContain('"><b>')
  })
})

describe('structured data', () => {
  const faq = block('faq', {
    items: [
      { question: 'Q1?', answer: 'A1' },
      { question: 'Q2?', answer: 'A2' },
    ],
  })
  const nav = block('navbar', { logo: 'Brand', logoImage: 'https://i.example/logo.png' })

  it.each([undefined, 'https://a.example'])('parses and is script-safe (siteUrl=%s)', (siteUrl) => {
    const html = exportSiteToHTML(site([nav, faq]), {
      siteUrl,
      settings: { siteName: '</script><b>x<!--' },
    })
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)!
    expect(m[1]).not.toContain('</script')
    expect(m[1]).not.toContain('<!--')
    const types = jsonLd(html)['@graph'].map((n) => n['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'FAQPage'])
    const org = jsonLd(html)['@graph'][0]
    expect(org.name).toBe('</script><b>x<!--')
    expect(org.logo).toBe('https://i.example/logo.png')
    expect(org.url).toBe(siteUrl)
    expect(jsonLd(html)['@graph'][1].url).toBe(siteUrl)
    expect(jsonLd(html)['@graph'][2].mainEntity).toHaveLength(2)
  })

  it('omits FAQPage for explicitly empty items', () => {
    const html = exportSiteToHTML(site([block('faq', { items: [] })]))
    expect(jsonLd(html)['@graph'].map((n) => n['@type'])).toEqual(['Organization', 'WebSite'])
  })

  it('skips items with a blank question or answer', () => {
    const out = renderJsonLd({
      name: 'S',
      origin: '',
      logo: '',
      faqs: [
        { question: ' ', answer: 'a' },
        { question: 'q', answer: '' },
        { question: 'ok', answer: 'fine' },
      ],
    })
    expect(out).toContain('"ok"')
    expect(out.match(/"@type":"Question"/g)).toHaveLength(1)
  })

  it('renders default faq items in markup and in structured data', () => {
    const html = exportSiteToHTML(site([block('faq', {})]))
    const q = jsonLd(html)['@graph'][2].mainEntity as Array<{ name: string }>
    expect(q.length).toBeGreaterThan(0)
    for (const item of q) expect(html).toContain(item.name)
  })

  it('omits a logo that fails the url policy', () => {
    const html = exportSiteToHTML(
      site([block('navbar', { logo: 'B', logoImage: 'javascript:alert(1)' })]),
    )
    expect(jsonLd(html)['@graph'][0].logo).toBeUndefined()
  })

  it('has no url fields without a valid site url', () => {
    const html = exportSiteToHTML(site([nav]), { siteUrl: 'https://u:p@a.example' })
    expect(jsonLd(html)['@graph'][0].url).toBeUndefined()
    expect(jsonLd(html)['@graph'][1].url).toBeUndefined()
  })
})

describe('font links', () => {
  it('preloads with a noscript fallback and no blocking stylesheet', () => {
    const html = exportSiteToHTML(site([]))
    const url = html.match(/<link rel="preload" as="style" href="([^"]+)"/)![1]
    expect(url).toContain('fonts.googleapis.com')
    expect(url).toContain('display=swap')
    expect(html).toContain('<noscript><link rel="stylesheet" href="' + url + '" /></noscript>')
    expect(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')).not.toContain(
      `rel="stylesheet" href="${url}"`,
    )
    expect(html).toContain('rel="preconnect" href="https://fonts.googleapis.com"')
    expect(html).toContain('rel="preconnect" href="https://fonts.gstatic.com"')
  })
  it.each(themePresets.map((preset) => [preset.id, preset] as const))(
    'theme preset %s: preload, onload switch and noscript share one url, with no blocking stylesheet',
    (_id, preset) => {
      const html = exportSiteToHTML({ name: 'S', theme: preset.theme, blocks: [] })
      const preloads = [...html.matchAll(/<link rel="preload" as="style" href="([^"]+)" onload="([^"]+)"/g)]
      expect(preloads).toHaveLength(1)
      const [, url, onload] = preloads[0]
      expect(onload).toBe("this.onload=null;this.rel='stylesheet'")
      expect([...html.matchAll(/<noscript><link rel="stylesheet" href="([^"]+)" \/><\/noscript>/g)].map((m) => m[1])).toEqual([url])
      const outsideNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
      expect(outsideNoscript).not.toContain(`rel="stylesheet" href="${url}"`)
    },
  )
  it('emits the url unchanged', () => {
    expect(renderFontLinks('https://f.example/css?a=1&b=2')).toContain('href="https://f.example/css?a=1&b=2"')
  })
})

describe('synchronous and side-effect free', () => {
  it('module source has no network, file or async use', () => {
    const src = readFileSync(resolve(__dirname, '../src/lib/export-seo-head.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const banned of [/\bfetch\b/, /\bfs\b/, /\basync\b/, /\bawait\b/, /\bimport\(/]) {
      expect(code).not.toMatch(banned)
    }
  })
  it('returns a string, not a promise', () => {
    expect(typeof exportSiteToHTML(site([]))).toBe('string')
  })
})
