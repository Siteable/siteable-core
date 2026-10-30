/**
 * The exported Facebook Feed block markup.
 *
 * A valid page address renders one container, an optional heading and exactly
 * one iframe whose address comes from the shared embed function. An invalid
 * address renders a placeholder and no iframe. The block adds no script to the
 * page, and every class it uses is already used by the video block.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { exportSiteToHTML } from '../src/lib/export-html'
import { facebookPageEmbedUrl } from '../src/lib/facebook-page-embed'
import type { BlockConfig, SiteConfig } from '../src/blocks/types'

const PAGE_URL = 'https://www.facebook.com/acme'
const REPO_ROOT = resolve(import.meta.dirname, '..')

const parse = (doc: string): Document => new DOMParser().parseFromString(doc, 'text/html')

function feedBlock(props: Record<string, unknown>): BlockConfig {
  return { id: 'feed', type: 'facebook-page', variant: 'default', props } as BlockConfig
}

function page(...blocks: BlockConfig[]): string {
  return exportSiteToHTML({ name: 'Site', blocks } as SiteConfig)
}

const navbar: BlockConfig = {
  id: 'nav',
  type: 'navbar',
  variant: 'default',
  props: { logo: 'Acme', links: ['A'] },
} as BlockConfig

function iframes(html: string): HTMLIFrameElement[] {
  return [...parse(html).querySelectorAll('iframe')]
}

function scripts(html: string): string[] {
  return [...parse(html).querySelectorAll('script')].map((s) => s.outerHTML)
}

describe('facebook page block markup', () => {
  it('renders one lazy iframe whose address comes from the shared function', () => {
    const frames = iframes(page(feedBlock({ url: PAGE_URL, title: 'Our feed', height: '600' })))
    expect(frames).toHaveLength(1)
    const frame = frames[0]
    expect(frame.getAttribute('src')).toBe(facebookPageEmbedUrl(PAGE_URL, '600'))
    expect(frame.getAttribute('loading')).toBe('lazy')
    expect(frame.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    expect(frame.getAttribute('title')).toBe('Our feed')
    expect(frame.getAttribute('width')).toBe('340')
    expect(frame.getAttribute('height')).toBe('600')
    expect(frame.getAttribute('style')).toContain('width:100%')
  })

  it('does not sandbox the frame or add the obsolete attributes', () => {
    const frame = iframes(page(feedBlock({ url: PAGE_URL })))[0]
    for (const name of ['sandbox', 'allow', 'allowfullscreen', 'scrolling', 'frameborder']) {
      expect(frame.hasAttribute(name), name).toBe(false)
    }
  })

  it('caps the container width at 340px and centres it', () => {
    const frame = iframes(page(feedBlock({ url: PAGE_URL })))[0]
    const style = frame.parentElement?.getAttribute('style') ?? ''
    expect(style).toContain('max-width:340px')
    expect(style).toContain('margin:0 auto')
  })

  it('falls back to a default accessible title when no title is given', () => {
    const frame = iframes(page(feedBlock({ url: PAGE_URL })))[0]
    expect(frame.getAttribute('title')).toBe('Facebook Page')
  })

  it('renders a heading only when a title is given', () => {
    const withTitle = parse(page(feedBlock({ url: PAGE_URL, title: 'Our feed' })))
    const headings = [...withTitle.querySelectorAll('h2')].map((h) => h.textContent)
    expect(headings).toEqual(['Our feed'])
    const without = parse(page(feedBlock({ url: PAGE_URL })))
    expect(without.querySelectorAll('h2')).toHaveLength(0)
  })

  const HEIGHTS: Array<[unknown, string]> = [
    [0, '70'],
    [69, '70'],
    [70, '70'],
    [800, '800'],
    [801, '800'],
    ['600', '600'],
    ['abc', '500'],
    [400.5, '500'],
    ['1e3', '500'],
    ['0x20', '500'],
    [400, '400'],
  ]
  for (const [input, expected] of HEIGHTS) {
    it(`uses frame height ${expected} for the stored height ${JSON.stringify(input)}`, () => {
      const frame = iframes(page(feedBlock({ url: PAGE_URL, height: input })))[0]
      expect(frame.getAttribute('height')).toBe(expected)
      expect(frame.getAttribute('src')).toBe(facebookPageEmbedUrl(PAGE_URL, input))
    })
  }

  it('renders a placeholder and no iframe for an address that is not a Page address', () => {
    for (const url of ['', 'https://example.com/acme', 'javascript:alert(1)', 'https://www.facebook.com/plugins/x']) {
      const html = page(feedBlock({ url, title: 'Feed' }))
      expect(iframes(html), url).toHaveLength(0)
      expect(html, url).toContain('bg-gradient-to-br')
      expect(html, url).toContain('max-width:340px')
    }
  })

  it('adds no runtime script or noscript style to a page with only this block', () => {
    const html = page(feedBlock({ url: PAGE_URL }))
    expect(html).not.toContain('data-sb-runtime')
    expect(html).not.toContain('<noscript><style>')
  })

  it('adds no script elements and no script bytes to the page', () => {
    const without = page()
    for (const props of [{ url: PAGE_URL, title: 'Feed' }, { url: 'nope' }]) {
      const withBlock = page(feedBlock(props))
      expect(scripts(withBlock)).toEqual(scripts(without))
      expect(scripts(withBlock).join('')).toBe(scripts(without).join(''))
    }
  })

  it('keeps exactly one runtime script on a page that also has a navbar', () => {
    const html = page(navbar, feedBlock({ url: PAGE_URL }))
    expect(html.match(/<script data-sb-runtime/g) ?? []).toHaveLength(1)
    expect(scripts(html)).toEqual(scripts(page(navbar)))
  })

  it('uses only class tokens that the video block already uses', () => {
    const classesOf = (file: string): Set<string> => {
      const src = readFileSync(resolve(REPO_ROOT, file), 'utf8')
      const tokens = new Set<string>()
      for (const m of src.matchAll(/class="([^"]*)"/g)) {
        for (const t of m[1].split(/\s+/).filter(Boolean)) tokens.add(t)
      }
      return tokens
    }
    const facebook = classesOf('src/lib/export-blocks/render-facebook-page.ts')
    const video = classesOf('src/lib/export-blocks/render-video.ts')
    expect(facebook.size).toBeGreaterThan(0)
    expect([...facebook].filter((t) => !video.has(t))).toEqual([])
  })
})
